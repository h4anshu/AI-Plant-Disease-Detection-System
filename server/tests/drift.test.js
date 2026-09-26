import { afterAll, afterEach, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { driftReport, sampleData } from '../scripts/drift_report.js';

const DATE = new Date('2026-10-01T12:00:00Z');
let mongod, col;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  col = mongoose.connection.collection('predictions');
});
afterEach(() => col.deleteMany({}));
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('flags a crop whose mean confidence fell more than 10 points below its 14-day baseline', async () => {
  await col.insertMany(sampleData(DATE));
  const report = await driftReport(col, { date: DATE });
  const byCrop = Object.fromEntries(report.crops.map((c) => [c.crop, c]));
  expect(report.reportDay).toBe('2026-10-01');
  expect(byCrop.wheat).toMatchObject({ flagged: true, count: 8 });
  expect(byCrop.wheat.dropPoints).toBeGreaterThan(10);
  expect(byCrop.rice.flagged).toBe(false);
  expect(byCrop.banana.flagged).toBe(false);
  expect(byCrop.rice.uncertainShare).toBe(0.125);
  expect(report.daily.filter((d) => d.crop === 'rice')).toHaveLength(15);
});

test('daily shares; records without a status count as ok; too few predictions never flag', async () => {
  const at = (h) => new Date(Date.UTC(2026, 9, 1, h));
  await col.insertMany([
    { crop: 'maize', confidence: 0.9, createdAt: at(1) }, // saved before the gate: no status
    { crop: 'maize', status: 'uncertain', confidence: 0.4, createdAt: at(2) },
    { crop: 'maize', status: 'not_leaf', createdAt: at(3) },
    { crop: 'maize', status: 'rejected_quality', createdAt: at(4), feedback: 'incorrect' },
    { crop: 'maize', status: 'ok', confidence: 0.95, createdAt: new Date(Date.UTC(2026, 8, 25)) }, // baseline
  ]);
  const report = await driftReport(col, { date: DATE });
  const maize = report.crops.find((c) => c.crop === 'maize');
  expect(maize).toMatchObject({ count: 4, meanConfidence: 0.65, uncertainShare: 0.25, rejectedShare: 0.5,
    baselineConfidence: 0.95, dropPoints: 30, flagged: false });
  expect(report.daily.find((d) => d.day === '2026-10-01').feedbackIncorrect).toBe(1);
});
