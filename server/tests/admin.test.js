import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Field from '../models/Field.js';
import Prediction from '../models/Prediction.js';
import PushSubscription from '../models/PushSubscription.js';

// GET /api/admin/summary (docs/ADMIN.md): counts for the operator, behind the shared token, and nothing that names anyone
const TOKEN = process.env.ALERTS_ADMIN_TOKEN;
const GUEST = new mongoose.Types.ObjectId('000000000000000000000000');
const DAY = 864e5;
const ago = (n) => new Date(Date.now() - n * DAY);

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => { await Promise.all([User, Field, Prediction, PushSubscription].map((m) => m.deleteMany({}))); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const summary = (token = TOKEN) => { const r = request(app).get('/api/admin/summary'); return token === null ? r : r.set('x-alerts-token', token); };
const checkup = (o = {}) => Prediction.create({ userId: GUEST, deviceId: 'dev-secret-1', imageUrl: 'https://img.test/a.jpg', crop: 'wheat', status: 'ok', disease: 'Yellow_Rust', confidence: 0.9,
  severity: 'moderate', treatment: 'Spray', yieldLossPercent: 10, createdAt: ago(1), ...o });
const keys = { p256dh: 'p'.repeat(10), auth: 'a'.repeat(10) };

describe('the token', () => {
  test('no token, a wrong one and one of another length are 401; unset on the server is 503; the right one is 200', async () => {
    expect((await summary(null)).status).toBe(401);
    expect((await summary('wrong')).status).toBe(401);
    expect((await summary(`${TOKEN}x`)).status).toBe(401);
    expect((await summary()).status).toBe(200);
    delete process.env.ALERTS_ADMIN_TOKEN;
    expect((await summary()).status).toBe(503);
    process.env.ALERTS_ADMIN_TOKEN = TOKEN;
  });
});

describe('the counts', () => {
  test('an empty database says zeros, not errors', async () => {
    const { body } = await summary();
    expect(body).toMatchObject({ users: { total: 0, newThisWeek: 0 }, fields: { total: 0, byCrop: {} }, checkups: { total: 0, last7Days: 0, last30Days: 0, byStatusLast30Days: {} },
      modelFeedback: { answered: 0, rightPct: null, byCrop: [] }, topDiseasesLast30Days: [], push: { subscriptions: 0, byLanguage: {} } });
  });

  test('users, fields, checkups by period and outcome, and notifications are counted', async () => {
    await User.create({ name: 'Asha', email: 'asha@example.com', passwordHash: 'x', createdAt: ago(2) });
    await User.create({ name: 'Old', email: 'old@example.com', passwordHash: 'x', createdAt: ago(40) });
    const location = { type: 'Point', coordinates: [75.66, 30.85] };
    await Field.create([{ userId: GUEST, deviceId: 'd1', crop: 'wheat', stage: 'flowering', location }, { userId: GUEST, deviceId: 'd2', crop: 'wheat', stage: 'sowing', location },
      { userId: GUEST, deviceId: 'd3', crop: 'rice', stage: 'sowing', location }]);
    await checkup({ createdAt: ago(1) });
    await checkup({ createdAt: ago(3), status: 'rejected_quality', disease: undefined, confidence: undefined, severity: undefined, treatment: undefined, yieldLossPercent: undefined });
    await checkup({ createdAt: ago(20), geoCell: '872a1070bffffff' });
    await checkup({ createdAt: ago(60) });
    await checkup({ createdAt: ago(1), demo: true });                                  // seed data is not counted
    await PushSubscription.create([{ userId: GUEST, deviceId: 'd1', endpoint: 'https://fcm.googleapis.com/a', keys, lang: 'hi' }, { userId: GUEST, deviceId: 'd2', endpoint: 'https://fcm.googleapis.com/b', keys, lang: 'pa' }]);
    const { body } = await summary();
    expect(body.users).toEqual({ total: 2, newThisWeek: 1 });
    expect(body.fields).toEqual({ total: 3, byCrop: { wheat: 2, rice: 1 } });
    expect(body.checkups).toEqual({ total: 4, last7Days: 2, last30Days: 3, byStatusLast30Days: { ok: 2, rejected_quality: 1 }, withLocationLast30Days: 1 });
    expect(body.push).toEqual({ subscriptions: 2, byLanguage: { hi: 1, pa: 1 } });
  });

  test('"Was this correct?" per crop: right is correct over correct plus incorrect; an unsure answer counts for neither; demo data is left out', async () => {
    for (const f of ['correct', 'correct', 'correct', 'incorrect']) await checkup({ crop: 'wheat', feedback: f });
    await checkup({ crop: 'wheat', feedback: 'unsure' });
    await checkup({ crop: 'rice', feedback: 'incorrect' });
    await checkup({ crop: 'rice', feedback: 'correct', demo: true });
    await checkup({ crop: 'rice' });                                                    // no answer
    const { body: { modelFeedback: m } } = await summary();
    expect(m.answered).toBe(6);
    expect(m.rightPct).toBe(60);                                                        // 3 right of 5 that said right or wrong
    expect(m.byCrop).toEqual([
      { crop: 'wheat', answered: 5, correct: 3, incorrect: 1, unsure: 1, rightPct: 75 },
      { crop: 'rice', answered: 1, correct: 0, incorrect: 1, unsure: 0, rightPct: 0 },
    ]);
  });

  test('the most common diseases of the month, healthy leaves and unsure results left out', async () => {
    for (let i = 0; i < 3; i++) await checkup({ disease: 'Yellow_Rust' });
    await checkup({ crop: 'potato', disease: 'Late_blight' });
    await checkup({ disease: 'Healthy', severity: 'healthy' });
    await checkup({ status: 'uncertain', disease: 'Yellow_Rust' });
    await checkup({ disease: 'Yellow_Rust', createdAt: ago(45) });
    expect((await summary()).body.topDiseasesLast30Days).toEqual([{ crop: 'wheat', disease: 'Yellow_Rust', n: 3 }, { crop: 'potato', disease: 'Late_blight', n: 1 }]);
  });

  test('nothing in the answer names a person, a browser, a field or a place', async () => {
    await User.create({ name: 'Asha Devi', email: 'asha@example.com', passwordHash: '$2a$10$secrethash', createdAt: ago(1) });
    await Field.create({ userId: GUEST, deviceId: 'dev-secret-1', name: 'North plot', crop: 'wheat', stage: 'sowing', location: { type: 'Point', coordinates: [75.666131, 30.858816] } });
    await checkup({ feedback: 'correct', geoCell: '872a1070bffffff' });
    const text = JSON.stringify((await summary()).body);
    expect(text).not.toMatch(/Asha|asha@|secrethash|dev-secret|North plot|75\.666|30\.858|872a1070|img\.test|https?:/);
  });
});
