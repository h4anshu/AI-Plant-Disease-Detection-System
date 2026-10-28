import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import AlertFeedback from '../models/AlertFeedback.js';

// "Did this help?": one answer per browser per rule and date, no place stored, deleted with "delete my data", summed up for the operator.
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const LAT = 30.858816;
const LON = 75.666131;
const save = (device = DEVICE, o = {}) => request(app).post('/api/fields').set('x-device-id', device).send({ crop: 'wheat', stage: 'flowering', lat: LAT, lon: LON, ...o });
const answer = (id, body, device = DEVICE) => request(app).post(`/api/fields/${id}/alerts/feedback`).set('x-device-id', device).send(body);
const GOOD = { alertId: 'FROST-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted' };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await AlertFeedback.init();
});
afterEach(async () => { await Promise.all([AlertFeedback, Field].map((m) => m.deleteMany({}))); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

describe('POST /api/fields/:id/alerts/feedback', () => {
  test('stores the rule, date, level, answer and the field\'s crop and stage, and nothing about the place', async () => {
    const { body: { _id } } = await save();
    const res = await answer(_id, GOOD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: 1 });
    const docs = await AlertFeedback.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ deviceId: DEVICE, rule: 'FROST-WHEAT-1', alertKey: 'FROST-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted', crop: 'wheat', stage: 'flowering' });
    expect(JSON.stringify(docs)).not.toMatch(new RegExp(`${_id}|30\\.85|75\\.66|location|coordinates`));
  });

  test('answering again replaces the answer: one row per browser and alert', async () => {
    const { body: { _id } } = await save();
    await answer(_id, GOOD);
    await answer(_id, { ...GOOD, answer: 'wrong' });
    const docs = await AlertFeedback.find({}).lean();
    expect(docs.map((d) => d.answer)).toEqual(['wrong']);
    await answer(_id, { ...GOOD, alertId: 'FROST-WHEAT-1|2027-02-26' });
    expect(await AlertFeedback.countDocuments()).toBe(2);
  });

  test('two browsers answering the same alert are two rows', async () => {
    const a = (await save()).body._id;
    const b = (await save(OTHER)).body._id;
    await answer(a, GOOD);
    await answer(b, { ...GOOD, answer: 'not_needed' }, OTHER);
    expect((await AlertFeedback.find({}).lean()).map((d) => d.answer).sort()).toEqual(['acted', 'not_needed']);
  });

  test('an official alert keeps only its source and the date: the long identifier is not stored', async () => {
    const { body: { _id } } = await save();
    await answer(_id, { alertId: 'SACHET|IN-1792839894548036_36', level: 'urgent', answer: 'acted' });
    await answer(_id, { alertId: 'IMD|2027-02-25', level: 'warn', answer: 'not_needed' });
    await answer(_id, { alertId: 'CWC|011-mgd4ptn|2027-02-24', level: 'watch', answer: 'wrong' });
    const keys = (await AlertFeedback.find({}).lean()).map((d) => d.alertKey).sort();
    expect(keys[0]).toMatch(/^CWC\|2027-02-24$/);
    expect(keys[1]).toBe('IMD|2027-02-25');
    expect(keys[2]).toMatch(/^SACHET\|\d{4}-\d\d-\d\d$/);
    expect(JSON.stringify(keys)).not.toMatch(/1792839894548036|mgd4ptn/);
  });

  test('the rules added in Phase 6 and the flood rule are accepted', async () => {
    const { body: { _id } } = await save();
    for (const rule of ['DRY-SPELL-1', 'DISEASE-NEAR-1', 'FIRE-NEAR-1', 'FLOOD-RIVER-1']) {
      expect((await answer(_id, { alertId: `${rule}|2027-02-25`, level: 'watch', answer: 'acted' })).status).toBe(200);
    }
  });

  test('bad input is a 400 and stores nothing: unknown rule, bad id, bad answer, bad level, no body', async () => {
    const { body: { _id } } = await save();
    expect((await answer(_id, { ...GOOD, alertId: 'MADE-UP-1|2027-02-25' })).status).toBe(400);
    expect((await answer(_id, { ...GOOD, alertId: 'FROST-WHEAT-1|<script>' })).status).toBe(400);
    expect((await answer(_id, { ...GOOD, alertId: 'x'.repeat(200) })).status).toBe(400);
    expect((await answer(_id, { ...GOOD, alertId: 12 })).status).toBe(400);
    expect((await answer(_id, { ...GOOD, answer: 'maybe' })).status).toBe(400);
    expect((await answer(_id, { ...GOOD, level: 'extreme' })).status).toBe(400);
    expect((await answer(_id, {})).status).toBe(400);
    expect(await AlertFeedback.countDocuments()).toBe(0);
  });

  test('another browser\'s field, a bad id, or no device id is a plain 404', async () => {
    const { body: { _id } } = await save();
    expect((await answer(_id, GOOD, OTHER)).status).toBe(404);
    expect((await answer('nope', GOOD)).status).toBe(404);
    expect((await request(app).post(`/api/fields/${_id}/alerts/feedback`).send(GOOD)).status).toBe(404);
    expect(await AlertFeedback.countDocuments()).toBe(0);
  });

  test('"delete my data" removes the answers of that browser only', async () => {
    const a = (await save()).body._id;
    const b = (await save(OTHER)).body._id;
    await answer(a, GOOD);
    await answer(b, GOOD, OTHER);
    expect((await request(app).delete('/api/predict').set('x-device-id', DEVICE)).status).toBe(200);
    const left = await AlertFeedback.find({}).lean();
    expect(left.map((d) => d.deviceId)).toEqual([OTHER]);
  });

  test('answers are kept a year (a TTL index)', async () => {
    const idx = await AlertFeedback.collection.indexes();
    expect(idx.find((i) => i.key.createdAt)?.expireAfterSeconds).toBe(365 * 86400);
  });
});

describe('GET /api/alerts/feedback (operator)', () => {
  const H = 'x-alerts-token';
  const rows = async () => {
    const { body: { _id } } = await save();
    const put = (rule, a, n) => Promise.all(Array.from({ length: n }, (_, i) => AlertFeedback.create({ userId: new mongoose.Types.ObjectId(), deviceId: `${rule}-${a}-${i}`, rule, alertKey: `${rule}|2027-02-${10 + i}`, level: 'watch', answer: a })));
    await put('FROST-WHEAT-1', 'acted', 3);
    await put('FROST-WHEAT-1', 'wrong', 1);
    await put('HEAT-RICE-1', 'not_needed', 2);
    return _id;
  };

  test('needs the operator token', async () => {
    expect((await request(app).get('/api/alerts/feedback')).status).toBe(401);
    expect((await request(app).get('/api/alerts/feedback').set(H, 'wrong')).status).toBe(401);
  });

  test('per rule: answers, the share that acted and the share that called it wrong; overall helpful share', async () => {
    await rows();
    const res = await request(app).get('/api/alerts/feedback').set(H, 'test-alerts-token');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.helpfulPct).toBe(50);                         // 3 of 6 acted
    expect(res.body.rules[0]).toEqual({ rule: 'FROST-WHEAT-1', total: 4, acted: 3, notNeeded: 0, wrong: 1, helpfulPct: 75, wrongPct: 25 });
    expect(res.body.rules[1]).toMatchObject({ rule: 'HEAT-RICE-1', total: 2, notNeeded: 2, helpfulPct: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/deviceId|-acted-|2027-02/);
  });

  test('no answers yet: an empty list and no percentage (not 0%)', async () => {
    const res = await request(app).get('/api/alerts/feedback').set(H, 'test-alerts-token');
    expect(res.body).toEqual({ total: 0, helpfulPct: null, rules: [] });
  });
});
