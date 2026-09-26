import { afterAll, afterEach, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import FieldHealthCache from '../models/FieldHealthCache.js';
import { parseLocation } from '../utils/geo.js';

const GUEST_ID = '000000000000000000000000';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const GEO = 'http://geo.test';
const ANSWER = { flag: { code: 'normal', since: null, stale: false }, summary: 'In line with nearby fields.',
  clear_images: 16, images: 31, last_clear_date: '2026-09-25', geometry_source: 'buffer_30m', series: [] };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  process.env.GEO_SERVICE_URL = GEO;
  process.env.GEO_SERVICE_TOKEN = 'test-geo-token';
});
afterEach(async () => {
  nock.cleanAll();
  await Prediction.deleteMany({});
  await FieldHealthCache.deleteMany({});
});
afterAll(async () => {
  delete process.env.GEO_SERVICE_URL;
  await mongoose.disconnect();
  await mongod.stop();
  nock.enableNetConnect();
});

const checkup = (extra = {}) => Prediction.create({
  userId: GUEST_ID, deviceId: DEVICE, crop: 'rice', status: 'ok', disease: 'Blast', confidence: 0.9, severity: 'early',
  treatment: 't', imageUrl: 'https://x/y.jpg', createdAt: new Date('2026-09-26T10:00:00Z'),
  ...parseLocation({ lat: '30.858816', lon: '75.666131', accuracy_m: '12', location_source: 'gps' }), ...extra,
});
const get = (id, device = DEVICE) => {
  const req = request(app).get(`/api/predict/${id}/field-health`);
  return device ? req.set('x-device-id', device) : req;
};

test('asks the geo-service once (location in a POST body, with the token), then answers from the cache', async () => {
  const p = await checkup();
  let body;
  const geo = nock(GEO).matchHeader('x-geo-token', 'test-geo-token')
    .post('/field-health', (b) => { body = b; return true; }).reply(200, ANSWER);
  const first = await get(p._id);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ flag: { code: 'normal' }, cached: false });
  expect(geo.isDone()).toBe(true);
  expect(body).toEqual({ lat: 30.858816, lon: 75.666131, date: '2026-09-26', days: 120, crop: 'rice' });

  const second = await get(p._id); // no nock interceptor left: a second geo call would fail
  expect(second.status).toBe(200);
  expect(second.body.cached).toBe(true);
  const [entry] = await FieldHealthCache.find().lean();
  expect(entry.key).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(entry)).not.toMatch(/30\.8588|75\.6661/); // the cache holds no readable location
  expect(JSON.stringify(second.body)).not.toMatch(/30\.8588|75\.6661/);
});

test('a checkup without a location -> 409, no geo call', async () => {
  const p = await checkup({ location: undefined, geoCell: null, locationSource: 'none' });
  expect((await get(p._id)).status).toBe(409);
});

test("someone else's checkup, no device id, or a bad id -> 404", async () => {
  const p = await checkup();
  expect((await get(p._id, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).status).toBe(404);
  expect((await get(p._id, null)).status).toBe(404);
  expect((await get('nope')).status).toBe(404);
});

test('geo-service busy (503) or failing -> a friendly 503 / 502, nothing cached', async () => {
  const p = await checkup();
  nock(GEO).post('/field-health').reply(503, { detail: 'Earth Engine error' });
  expect((await get(p._id)).status).toBe(503);
  nock(GEO).post('/field-health').reply(500, 'Traceback...');
  const res = await get(p._id);
  expect(res.status).toBe(502);
  expect(JSON.stringify(res.body)).not.toMatch(/Traceback/);
  expect(await FieldHealthCache.countDocuments()).toBe(0);
});

test('without GEO_SERVICE_URL the feature is simply unavailable (503)', async () => {
  const p = await checkup();
  delete process.env.GEO_SERVICE_URL;
  try {
    expect((await get(p._id)).status).toBe(503);
  } finally {
    process.env.GEO_SERVICE_URL = GEO;
  }
});

test('"delete my data" also removes the cached satellite answer for those fields', async () => {
  const p = await checkup();
  nock(GEO).post('/field-health').reply(200, ANSWER);
  await get(p._id);
  expect(await FieldHealthCache.countDocuments()).toBe(1);
  nock('https://api.cloudinary.com').post(/destroy/).reply(200, { result: 'ok' });
  expect((await request(app).delete('/api/predict').set('x-device-id', DEVICE)).body).toEqual({ deleted: 1 });
  expect(await FieldHealthCache.countDocuments()).toBe(0);
});
