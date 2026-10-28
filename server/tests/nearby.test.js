import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import { latLngToCell } from 'h3-js';
import app from '../app.js';
import Field from '../models/Field.js';
import Prediction from '../models/Prediction.js';
import { WeatherCache } from '../services/openMeteo.js';
import { nearbyDisease } from '../services/nearbyDisease.js';
import { H3_RESOLUTION } from '../utils/geo.js';
import logger from '../utils/logger.js';

// "Disease reports near you": the public map's data around a field. Reports are written straight into the collection (what a
// checkup saves: crop, disease, status, geoCell, deviceId); weather is a calm 3 mm shower each night so no dry-spell alert joins them.
const NOW = new Date();
const DAY = 864e5;
const LAT = 30.9012;
const LON = 75.8573;
const CELL = latLngToCell(LAT, LON, H3_RESOLUTION);
const FAR = latLngToCell(LAT + 0.5, LON, H3_RESOLUTION);            // about 55 km away
const MINE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const dev = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const field = { crop: 'potato', stage: 'vegetative', location: { coordinates: [LON, LAT] } };

const report = (device, o = {}) => ({ userId: new mongoose.Types.ObjectId(), deviceId: device, imageUrl: 'u', crop: 'potato', status: 'ok', disease: 'Early_blight', confidence: 0.9,
  severity: 'moderate', treatment: 'Spray as advised', yieldLossPercent: 10, geoCell: CELL, locationSource: 'gps', createdAt: new Date(NOW.getTime() - 2 * DAY), ...o });
const seed = (n, o = {}, from = 1) => Prediction.insertMany(Array.from({ length: n }, (_, i) => report(dev(from + i), o)), { ordered: true });
const pad = (n) => String(n).padStart(2, '0');
const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const meteo = () => {
  const today = new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
  const time = [];
  for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${add(today, i)}T${pad(h)}:00`);
  return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: time.map((t) => (Number(t.slice(11, 13)) < 6 ? 12 : 22)),
    relative_humidity_2m: time.map(() => 60), precipitation: time.map((t) => (t.slice(11, 13) === '03' ? 3 : 0)) } };
};

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
afterEach(async () => {
  nock.cleanAll();
  jest.restoreAllMocks();
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
  await Promise.all([Prediction, Field, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

describe('nearbyDisease', () => {
  test('nothing reported, or fewer than 3 different browsers: no alert (the map rule)', async () => {
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();
    await seed(2);
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();
    await seed(1, {}, 3);                                               // a third browser
    expect(await nearbyDisease(field, MINE, NOW)).toMatchObject({ values: { value: 3 } });
  });

  test('one browser sending many photos is one report; three browsers make an info alert, six a watch', async () => {
    await Prediction.insertMany(Array.from({ length: 20 }, () => report(dev(1))));
    await Prediction.insertMany([report(dev(2)), report(dev(2))]);
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();          // 2 browsers
    await seed(1, {}, 3);
    expect(await nearbyDisease(field, MINE, NOW)).toMatchObject({ level: 'info', values: { value: 3 } });
    await seed(3, {}, 4);
    expect(await nearbyDisease(field, MINE, NOW)).toMatchObject({ level: 'watch', values: { value: 6 } });
  });

  test('the alert says which disease, for which crop, and holds no place', async () => {
    await seed(3, { disease: 'Late_blight' });
    const a = await nearbyDisease(field, MINE, NOW);
    expect(a).toMatchObject({ rule: 'DISEASE-NEAR-1', hazard: 'disease_near', disease: 'Late_blight', crop: 'potato', stage: 'vegetative', confidence: 'low', reviewStatus: 'draft',
      values: { metric: 'reports', value: 3, window: 14, radiusKm: 5 }, offset: 0 });
    expect(a.id).toMatch(/^DISEASE-NEAR-1\|\d{4}-\d\d-\d\d$/);
    expect(JSON.stringify(a)).not.toMatch(new RegExp(`${CELL}|30\\.9|75\\.8`));
  });

  test('only the field\'s crop, only confident diagnoses, not healthy leaves, not demo points, not older than 14 days', async () => {
    await seed(3, { crop: 'wheat', disease: 'Rust' });
    await seed(3, { status: 'uncertain' }, 10);
    await seed(3, { disease: 'Healthy', severity: 'healthy' }, 20);
    await seed(3, { demo: true }, 30);
    await seed(3, { createdAt: new Date(NOW.getTime() - 15 * DAY) }, 40);
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();
    await seed(3, { createdAt: new Date(NOW.getTime() - 13 * DAY) }, 50);
    expect(await nearbyDisease(field, MINE, NOW)).toMatchObject({ values: { value: 3 } });
  });

  test('the field\'s own browser does not count; reports around the field do, far away ones do not', async () => {
    await seed(2);                                                      // dev 1, 2
    await Prediction.insertMany([report(MINE)]);                        // the farmer\'s own photo would be the third
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();
    expect(await nearbyDisease(field, null, NOW)).toMatchObject({ values: { value: 3 } }); // a caller without a device id: nothing to leave out
    await Prediction.deleteMany({});
    await seed(3, { geoCell: FAR });
    expect(await nearbyDisease(field, MINE, NOW)).toBeNull();
  });

  test('the commonest disease wins; two diseases do not make two alerts', async () => {
    await seed(3, { disease: 'Early_blight' });
    await seed(4, { disease: 'Late_blight' }, 10);
    expect(await nearbyDisease(field, MINE, NOW)).toMatchObject({ disease: 'Late_blight', values: { value: 4 } });
  });
});

describe('GET /api/fields/alerts with reports nearby', () => {
  const save = () => request(app).post('/api/fields').set('x-device-id', MINE).send({ crop: 'potato', stage: 'vegetative', lat: LAT, lon: LON });
  const alerts = () => request(app).get('/api/fields/alerts').set('x-device-id', MINE);

  test('the answer carries the alert, without a cell, a point or other people\'s ids', async () => {
    await seed(3, { disease: 'Late_blight' });
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, meteo());
    await save();
    const res = await alerts();
    expect(res.status).toBe(200);
    const [f] = res.body.fields;
    expect(f.alerts.map((a) => a.rule)).toEqual(['DISEASE-NEAR-1']);
    expect(f.alerts[0]).toMatchObject({ level: 'info', disease: 'Late_blight', values: { value: 3 } });
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${CELL}|30\\.9012|75\\.8573|00000000-0000-4000`));
  });

  test('with weather down the community alert is still listed; the switch "community" removes it', async () => {
    await seed(3);
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    await save();
    const [down] = (await alerts()).body.fields;
    expect(down).toMatchObject({ status: 'weather_unavailable' });
    expect(down.alerts.map((a) => a.rule)).toEqual(['DISEASE-NEAR-1']);
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news,community';
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    expect((await alerts()).body.fields[0].alerts).toEqual([]);
  });

  test('a failing lookup leaves the alert out and the rest of the answer in', async () => {
    const warn = jest.spyOn(logger, 'warn');
    jest.spyOn(Prediction, 'aggregate').mockRejectedValue(new Error('db down'));
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, meteo());
    await save();
    const res = await alerts();
    expect(res.status).toBe(200);
    expect(res.body.fields[0]).toMatchObject({ status: 'ok', alerts: [] });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }), 'Disease reports nearby failed');
  });
});
