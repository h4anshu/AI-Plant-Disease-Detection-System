import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import { FloodExtentCache } from '../models/Flood.js';
import logger from '../utils/logger.js';

// GET /api/fields/:id/flood-extent: the radar flood check of the geo-service (Earth Engine), owner only, cached, never carrying the place.
// The geo-service answers below are real ones (statistics only) from 26 Oct 2026: the Ravi floodplain on 4 Sep 2025 and a dry upland.
const GEO = 'http://geo.test';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const LAT = 31.93;
const LON = 74.68;
const LIMITS = ['radar_misses_canopy_and_town', 'irrigated_paddy_reads_as_water', 'short_floods_between_passes_are_missed'];
const FLOODED = { status: 'ok', buffer_m: 500, image_date: '2025-09-04', age_days: 1, baseline_images: 17, usable_pct: 95.8, water_pct: 94.6, new_water_pct: 68.1, flag: 'likely', limits: LIMITS };
const NONE = { status: 'ok', buffer_m: 500, image_date: '2025-09-04', age_days: 1, baseline_images: 27, usable_pct: 89.2, water_pct: 0, new_water_pct: 0, flag: 'none', limits: LIMITS };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
beforeEach(() => {
  process.env.GEO_SERVICE_URL = GEO;
  process.env.GEO_SERVICE_TOKEN = 'test-geo-token';
});
afterEach(async () => {
  nock.cleanAll();
  jest.restoreAllMocks();
  delete process.env.GEO_SERVICE_URL;
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas';
  await Promise.all([Field, FloodExtentCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

const save = async (device = DEVICE) => (await request(app).post('/api/fields').set('x-device-id', device).send({ crop: 'rice', stage: 'flowering', lat: LAT, lon: LON })).body._id;
const check = (id, device = DEVICE) => request(app).get(`/api/fields/${id}/flood-extent`).set('x-device-id', device);
const geo = (reply = FLOODED, status = 200, seen = []) => nock(GEO).post('/flood-extent', (b) => { seen.push(b); return true; }).reply(status, reply);

describe('the radar flood check of a field', () => {
  test('asks the geo-service with the place in the body and the token, and returns its answer without the place', async () => {
    const id = await save();
    const seen = [];
    let headers;
    nock(GEO).post('/flood-extent', (b) => { seen.push(b); return true; }).reply(function reply() { headers = this.req.headers; return [200, FLOODED]; });
    const res = await check(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', flag: 'likely', new_water_pct: 68.1, image_date: '2025-09-04', cached: false });
    expect(seen).toEqual([{ lat: LAT, lon: LON }]);
    expect(headers['x-geo-token']).toBe('test-geo-token');
    expect(JSON.stringify(res.body)).not.toMatch(/31\.93|74\.68/);
  });

  test('the same place on the same day is answered from the cache: no second Earth Engine call', async () => {
    const id = await save();
    geo(NONE);
    expect((await check(id)).body.cached).toBe(false);
    const again = await check(id);   // there is no second mock: a call would fail
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ flag: 'none', cached: true });
    expect(await FloodExtentCache.countDocuments()).toBe(1);
    const stored = await FloodExtentCache.findOne({}).lean();
    expect(stored.key).toMatch(/^[0-9a-f]{64}$/);                    // a hash: no readable place
    expect(JSON.stringify(stored)).not.toMatch(/31\.93|74\.68/);
  });

  test('"no recent image" and "too little data" are answers too, and are cached', async () => {
    const id = await save();
    geo({ status: 'no_recent_image', buffer_m: 500, recent_days: 12, last_image: '2025-08-12', flag: null, limits: LIMITS });
    const res = await check(id);
    expect(res.body).toMatchObject({ status: 'no_recent_image', last_image: '2025-08-12', flag: null });
    expect((await check(id)).body.cached).toBe(true);
  });

  test('only the owner: another browser, a malformed id and a missing id are all "not found"', async () => {
    const id = await save();
    expect((await check(id, OTHER)).status).toBe(404);
    expect((await check('not-an-id')).status).toBe(404);
    expect((await check(new mongoose.Types.ObjectId().toString())).status).toBe(404);
    expect((await request(app).get(`/api/fields/${id}/flood-extent`)).status).toBe(404); // a guest without a device id owns nothing
  });

  test.each([[503, 503, /busy/], [500, 502, /unavailable/], [401, 502, /unavailable/]])('the geo-service answering %i is shown as %i, with no detail of it', async (geoStatus, ours, text) => {
    const id = await save();
    geo({ detail: 'secret internals' }, geoStatus);
    const res = await check(id);
    expect(res.status).toBe(ours);
    expect(res.body.message).toMatch(text);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|31\.93/);
    expect(await FloodExtentCache.countDocuments()).toBe(0);          // a failure is not cached
  });

  test('a geo-service that cannot be reached is a 502, and the log carries no place', async () => {
    const id = await save();
    const errors = jest.spyOn(logger, 'error');
    // a REAL refused connection (nothing listens on port 1), not nock's simulated one: replyWithError sometimes raised an unhandled socket
    // error on a slow machine and failed the whole suite in CI
    process.env.GEO_SERVICE_URL = 'http://127.0.0.1:1';
    expect((await check(id)).status).toBe(502);
    expect(errors).toHaveBeenCalled();
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/31\.93|74\.68/);
  });

  test('without the geo-service configured, or with the radar switched off, it is "not available" and asks nothing', async () => {
    const id = await save();
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,radar';
    expect((await check(id)).status).toBe(503);
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas';
    delete process.env.GEO_SERVICE_URL;
    expect((await check(id)).status).toBe(503);
  });

  test('"Delete my data" removes the cached answer of the field too (its key is a hash of the place, which can be tried out), and only for that browser', async () => {
    const mine = await save();
    const other = await save('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    geo(); await check(mine);
    geo(); await check(other, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(await FloodExtentCache.countDocuments()).toBe(1);        // same place and day: one shared cache row
    const res = await request(app).delete('/api/predict').set('x-device-id', DEVICE);
    expect(res.status).toBe(200);
    expect(await FloodExtentCache.countDocuments()).toBe(0);
    expect(await Field.countDocuments()).toBe(1);                   // the other browser's field is still there
  });

  test('a deleted field is gone: its check is "not found" even if an answer is cached', async () => {
    const id = await save();
    geo(NONE);
    await check(id);
    await request(app).delete(`/api/fields/${id}`).set('x-device-id', DEVICE);
    expect((await check(id)).status).toBe(404);
  });
});
