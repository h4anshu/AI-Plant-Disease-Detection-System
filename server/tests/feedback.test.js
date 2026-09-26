import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import logger from '../utils/logger.js';

const GUEST_ID = '000000000000000000000000';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER_DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const base = { imageUrl: 'https://res.cloudinary.com/x/leaf.jpg', crop: 'wheat', disease: 'LeafBlight', confidence: 0.91,
  severity: 'moderate', treatment: 't', userId: GUEST_ID, deviceId: DEVICE,
  modelVersion: { backbone: '1.0.0', head: '1.0.0', gate: '1.0.0' } };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  jest.restoreAllMocks();
  await Prediction.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const send = (id, body, device = DEVICE) => {
  const req = request(app).patch(`/api/predict/${id}/feedback`).send(body);
  return device ? req.set('x-device-id', device) : req;
};

test('GET /api/predict/classes lists exactly the ML service classes per crop', async () => {
  const labelMaps = JSON.parse(fs.readFileSync(new URL('../../ml-service/data/label_maps.json', import.meta.url), 'utf8'));
  const res = await request(app).get('/api/predict/classes');
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(Object.keys(labelMaps).sort());
  for (const [crop, classes] of Object.entries(labelMaps)) {
    expect([...res.body[crop]].sort()).toEqual(Object.keys(classes).sort());
  }
});

describe('PATCH /api/predict/:id/feedback', () => {
  test('"correct" is stored with a timestamp and no corrected label', async () => {
    const p = await Prediction.create(base);
    const res = await send(p._id, { feedback: 'correct' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ feedback: 'correct', correctedLabel: null });
    const saved = await Prediction.findById(p._id).lean();
    expect(saved).toMatchObject({ feedback: 'correct', correctedLabel: null });
    expect(saved.feedbackAt).toBeInstanceOf(Date);
  });

  test.each(['WheatBlast', 'Other'])('"incorrect" with the corrected class %s', async (label) => {
    const p = await Prediction.create(base);
    const res = await send(p._id, { feedback: 'incorrect', correctedLabel: label });
    expect(res.status).toBe(200);
    expect((await Prediction.findById(p._id).lean()).correctedLabel).toBe(label);
  });

  test('a later answer replaces the earlier one', async () => {
    const p = await Prediction.create(base);
    await send(p._id, { feedback: 'incorrect', correctedLabel: 'WheatBlast' });
    await send(p._id, { feedback: 'unsure' });
    expect(await Prediction.findById(p._id).lean()).toMatchObject({ feedback: 'unsure', correctedLabel: null });
  });

  test.each([
    ['unknown feedback value', { feedback: 'maybe' }],
    ['"incorrect" without a label', { feedback: 'incorrect' }],
    ['"incorrect" with another crop\'s class', { feedback: 'incorrect', correctedLabel: 'Bacterialblight' }],
    ['a label with "correct"', { feedback: 'correct', correctedLabel: 'WheatBlast' }],
    ['a non-string label', { feedback: 'incorrect', correctedLabel: { $ne: null } }],
  ])('%s -> 400, nothing saved', async (_, body) => {
    const p = await Prediction.create(base);
    expect((await send(p._id, body)).status).toBe(400);
    expect((await Prediction.findById(p._id).lean()).feedback).toBeNull();
  });

  test.each([
    ["another browser's record", OTHER_DEVICE],
    ['no device id', null],
  ])('%s -> 404, nothing saved', async (_, device) => {
    const p = await Prediction.create(base);
    expect((await send(p._id, { feedback: 'correct' }, device)).status).toBe(404);
    expect((await Prediction.findById(p._id).lean()).feedback).toBeNull();
  });

  test('a signed-in user\'s record or a malformed / unknown id -> 404', async () => {
    const other = await Prediction.create({ ...base, userId: '111111111111111111111111', deviceId: null });
    expect((await send(other._id, { feedback: 'correct' })).status).toBe(404);
    expect((await send('not-an-id', { feedback: 'correct' })).status).toBe(404);
    expect((await send(new mongoose.Types.ObjectId(), { feedback: 'correct' })).status).toBe(404);
  });

  test('the feedback log line carries the labels and model version, not the image or the device', async () => {
    const info = jest.spyOn(logger, 'info');
    const p = await Prediction.create(base);
    await send(p._id, { feedback: 'incorrect', correctedLabel: 'WheatBlast' }).set('x-request-id', 'req-123');
    const [entry] = info.mock.calls.find(([, msg]) => msg === 'feedback');
    expect(entry).toMatchObject({ requestId: 'req-123', crop: 'wheat', predicted: 'LeafBlight', feedback: 'incorrect',
      correctedLabel: 'WheatBlast', modelVersion: { head: '1.0.0' } });
    expect(JSON.stringify(entry)).not.toMatch(/cloudinary|3f2b8c1e/);
  });
});
