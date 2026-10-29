import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Field from '../models/Field.js';
import FieldHealthCache from '../models/FieldHealthCache.js';
import { ApiUsage } from '../services/usage.js';
import logger from '../utils/logger.js';

// GET /api/fields/:id/health: how the crop of a SAVED field looks from space (docs/CROP_HEALTH.md): owner only, on request, cached per day,
// the place only in a POST body to the geo-service, never in an answer, a cache key or a log.
const GEO = 'http://geo.test';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const LAT = 30.858816;
const LON = 75.666131;
const ANSWER = { flag: { code: 'below', since: '2026-10-10', stale: false }, summary: 'Behind the fields around it.', clear_images: 12, images: 20,
  last_clear_date: '2026-10-25', geometry_source: 'buffer_30m', series: [] };
const day = () => new Date().toISOString().slice(0, 10);

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
  jest.restoreAllMocks();
  process.env.GEO_SERVICE_URL = GEO;
  await Promise.all([User, Field, FieldHealthCache, ApiUsage].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  delete process.env.GEO_SERVICE_URL;
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

const save = async (device = DEVICE, o = {}) => (await request(app).post('/api/fields').set('x-device-id', device).send({ crop: 'wheat', stage: 'flowering', lat: LAT, lon: LON, ...o })).body._id;
const health = (id, device = DEVICE) => request(app).get(`/api/fields/${id}/health`).set('x-device-id', device);

describe('the crop health of a saved field', () => {
  test('asks the geo-service with the place in a POST body and the token, today as the end of the window, and returns its answer without the place', async () => {
    const id = await save();
    let body;
    let headers;
    nock(GEO).post('/field-health', (b) => { body = b; return true; }).reply(function reply() { headers = this.req.headers; return [200, ANSWER]; });
    const res = await health(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ flag: { code: 'below' }, cached: false });
    expect(body).toEqual({ lat: LAT, lon: LON, date: day(), days: 120, crop: 'wheat' });
    expect(headers['x-geo-token']).toBe('test-geo-token');
    expect(JSON.stringify(res.body)).not.toMatch(/30\.8588|75\.6661/);
  });

  test('the same field on the same day is answered from the cache (no second Earth Engine call, counted once), under a key that is a hash', async () => {
    const id = await save();
    nock(GEO).post('/field-health').reply(200, ANSWER);
    expect((await health(id)).body.cached).toBe(false);
    const again = await health(id);                                           // no second mock: a call would fail
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ flag: { code: 'below' }, cached: true });
    const [entry] = await FieldHealthCache.find().lean();
    expect(entry.key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(entry)).not.toMatch(/30\.8588|75\.6661/);
    expect((await ApiUsage.findOne({ service: 'earth-engine-health' }).lean()).calls).toBe(1);
  });

  test('only the owner: another browser, a malformed id, a missing id, and a guest without a device id are all "not found", with no geo call', async () => {
    const id = await save();
    expect((await health(id, OTHER)).status).toBe(404);
    expect((await health('not-an-id')).status).toBe(404);
    expect((await health(new mongoose.Types.ObjectId().toString())).status).toBe(404);
    expect((await request(app).get(`/api/fields/${id}/health`)).status).toBe(404);
  });

  test('an account reaches its own field, and nobody else\'s', async () => {
    const token = `Bearer ${(await request(app).post('/api/auth/register').send({ name: 'Asha', email: 'a@example.com', password: 'correct horse battery' })).body.token}`;
    const id = (await request(app).post('/api/fields').set('authorization', token).send({ crop: 'rice', stage: 'sowing', lat: LAT, lon: LON })).body._id;
    nock(GEO).post('/field-health', (b) => b.crop === 'rice').reply(200, ANSWER);
    expect((await request(app).get(`/api/fields/${id}/health`).set('authorization', token)).status).toBe(200);
    expect((await health(id)).status).toBe(404);                              // the browser of a guest
  });

  test.each([[503, 503, /busy/], [500, 502, /unavailable/], [401, 502, /unavailable/]])('the geo-service answering %i is shown as %i, with no detail, and nothing is cached', async (geoStatus, ours, text) => {
    const id = await save();
    nock(GEO).post('/field-health').reply(geoStatus, { detail: 'secret internals' });
    const res = await health(id);
    expect(res.status).toBe(ours);
    expect(res.body.message).toMatch(text);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|30\.8588/);
    expect(await FieldHealthCache.countDocuments()).toBe(0);
    expect(await ApiUsage.countDocuments({ service: 'earth-engine-health' })).toBe(0);
  });

  test('a geo-service that cannot be reached is a 502 and the log carries no place', async () => {
    const id = await save();
    const errors = jest.spyOn(logger, 'error');
    process.env.GEO_SERVICE_URL = 'http://127.0.0.1:1';                       // a real refused connection (see floodExtent.test.js)
    expect((await health(id)).status).toBe(502);
    expect(errors).toHaveBeenCalled();
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/30\.8588|75\.6661/);
  });

  test('without the geo-service configured it is "not available" and asks nothing', async () => {
    const id = await save();
    delete process.env.GEO_SERVICE_URL;
    expect((await health(id)).status).toBe(503);
  });

  test('"Delete my data" removes the cached answers of the field too (their keys are hashes of the place, which can be tried out)', async () => {
    const id = await save();
    nock(GEO).post('/field-health').reply(200, ANSWER);
    await health(id);
    const other = await save(OTHER);
    nock(GEO).post('/field-health').reply(200, ANSWER);
    await health(other, OTHER);
    expect(await FieldHealthCache.countDocuments()).toBe(1);                  // same place, crop and day: one shared row
    expect((await request(app).delete('/api/predict').set('x-device-id', DEVICE)).status).toBe(200);
    expect(await FieldHealthCache.countDocuments()).toBe(0);
    expect(await Field.countDocuments()).toBe(1);
  });
});
