import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import Prediction from '../models/Prediction.js';
import { WeatherCache } from '../services/openMeteo.js';
import logger from '../utils/logger.js';

const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const LAT = 30.858816;
const LON = 75.666131;
const EXACT = /30\.8588|75\.6661/; // the exact point must never appear in answers or logs
const body = (o = {}) => ({ crop: 'wheat', stage: 'flowering', lat: LAT, lon: LON, name: 'North plot', ...o });

const pad = (n) => String(n).padStart(2, '0');
const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const indiaToday = () => new Date(Date.now() + 19800 * 1000).toISOString().slice(0, 10);

// Open-Meteo's answer (local time) for 14 past days + 5 forecast days; a 1.4 °C night tomorrow at 04:00, otherwise mild
const meteo = (frost = true) => {
  const today = indiaToday();
  const time = [];
  for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${add(today, i)}T${pad(h)}:00`);
  const tomorrow = add(today, 1);
  const temp = time.map((t) => (frost && t === `${tomorrow}T04:00` ? 1.4 : Number(t.slice(11, 13)) < 6 ? 8 : 18));
  return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: temp,
    relative_humidity_2m: time.map(() => 60), precipitation: time.map((t) => (t.slice(11, 13) === '03' ? 3 : 0)) } };
};
const mockMeteo = (seen = [], answer = meteo()) => nock('http://meteo.test').get('/v1/forecast')
  .query((q) => { seen.push(q); return true; }).reply(200, answer);

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
  await Promise.all([Field, Prediction, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

const post = (o, device = DEVICE) => request(app).post('/api/fields').set('x-device-id', device).send(body(o));
const list = (device = DEVICE) => request(app).get('/api/fields').set('x-device-id', device);
const alerts = (device = DEVICE) => request(app).get('/api/fields/alerts').set('x-device-id', device);

describe('saving a field', () => {
  test('201 with the field, never its exact location; the point is stored privately', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'North plot', crop: 'wheat', stage: 'flowering' });
    expect(typeof res.body._id).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/location|coordinates|lat|lon|userId|deviceId/i);
    const saved = await Field.findById(res.body._id).lean();
    expect(saved.location.coordinates).toEqual([LON, LAT]);
    expect(saved.deviceId).toBe(DEVICE);
    const l = await list();
    expect(l.body).toHaveLength(1);
    expect(JSON.stringify(l.body)).not.toMatch(EXACT);
  });

  test('numeric strings are accepted, the name is trimmed and may be left out', async () => {
    const res = await post({ lat: '30.9', lon: '75.85', name: '  Canal plot  ' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Canal plot');
    const noName = await request(app).post('/api/fields').set('x-device-id', DEVICE).send({ crop: 'rice', stage: 'sowing', lat: 20.46, lon: 85.88 });
    expect(noName.status).toBe(201);
    expect(noName.body.name).toBe('');
  });

  test.each([
    ['unknown crop', { crop: 'barley' }, 'Invalid crop'],
    ['no crop', { crop: undefined }, 'Invalid crop'],
    ['unknown stage', { stage: 'ripe' }, 'Invalid stage'],
    ['name too long', { name: 'x'.repeat(41) }, 'Invalid name'],
    ['name not text', { name: 5 }, 'Invalid name'],
    ['latitude out of range', { lat: 91 }, 'Invalid location'],
    ['longitude out of range', { lon: -181 }, 'Invalid location'],
    ['latitude not a number', { lat: 'abc' }, 'Invalid location'],
    ['no latitude', { lat: undefined }, 'Invalid location'],
    ['empty-string longitude', { lon: '  ' }, 'Invalid location'],
  ])('400 for %s', async (_name, o, message) => {
    const res = await post(o);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(await Field.countDocuments()).toBe(0);
  });

  test('a body that is not an object, and one that is not JSON, are 400', async () => {
    expect((await request(app).post('/api/fields').set('x-device-id', DEVICE).send([1, 2])).status).toBe(400);
    const bad = await request(app).post('/api/fields').set('x-device-id', DEVICE).set('content-type', 'application/json').send('{nope');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Invalid request body');
  });

  test('a browser can keep 3 fields; the 4th is 409 until one is deleted', async () => {
    for (let i = 0; i < 3; i++) expect((await post({ name: `f${i}` })).status).toBe(201);
    const res = await post({ name: 'f3' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/up to 3/);
    expect(await Field.countDocuments()).toBe(3);
    const first = (await list()).body[0];
    expect((await request(app).delete(`/api/fields/${first._id}`).set('x-device-id', DEVICE)).status).toBe(200);
    expect((await post({ name: 'f4' })).status).toBe(201);
    expect((await post({ name: 'other browser' }, OTHER)).status).toBe(201); // the cap is per browser
  });

  test('a guest without a device id cannot save; an invalid device id is 400', async () => {
    const res = await request(app).post('/api/fields').send(body());
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing device id');
    expect((await request(app).get('/api/fields')).body).toEqual([]);
    expect((await request(app).get('/api/fields').set('x-device-id', 'nope')).status).toBe(400);
  });
});

describe('changing and deleting a field', () => {
  test('stage and name can change; the crop and the place cannot', async () => {
    const f = (await post()).body;
    const res = await request(app).patch(`/api/fields/${f._id}`).set('x-device-id', DEVICE).send({ stage: 'harvest_ready', name: ' East ', crop: 'rice', lat: 1, lon: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stage: 'harvest_ready', name: 'East', crop: 'wheat' });
    const saved = await Field.findById(f._id).lean();
    expect(saved.location.coordinates).toEqual([LON, LAT]);
    expect(saved.crop).toBe('wheat');
  });

  test('bad values are 400 and change nothing; an empty patch returns the field', async () => {
    const f = (await post()).body;
    const patch = (b) => request(app).patch(`/api/fields/${f._id}`).set('x-device-id', DEVICE).send(b);
    expect((await patch({ stage: 'late' })).status).toBe(400);
    expect((await patch({ name: 'y'.repeat(41) })).status).toBe(400);
    expect((await patch({})).body).toMatchObject({ stage: 'flowering', name: 'North plot' });
    expect((await Field.findById(f._id).lean()).stage).toBe('flowering');
  });

  test('another browser, a bad id and an unknown id all get 404 on patch and delete', async () => {
    const f = (await post()).body;
    const unknown = new mongoose.Types.ObjectId();
    for (const [method, id, device] of [['patch', f._id, OTHER], ['patch', 'nope', DEVICE], ['patch', unknown, DEVICE],
      ['delete', f._id, OTHER], ['delete', 'nope', DEVICE], ['delete', unknown, DEVICE]]) {
      const res = await request(app)[method](`/api/fields/${id}`).set('x-device-id', device).send({ stage: 'sowing' });
      expect(res.status).toBe(404);
    }
    expect(await Field.countDocuments()).toBe(1);
    expect((await request(app).patch(`/api/fields/${f._id}`).send({ stage: 'sowing' })).status).toBe(404); // no device id
  });

  test('delete removes it once; the second time is 404', async () => {
    const f = (await post()).body;
    const del = () => request(app).delete(`/api/fields/${f._id}`).set('x-device-id', DEVICE);
    expect((await del()).body).toEqual({ deleted: 1 });
    expect((await del()).status).toBe(404);
    expect((await list()).body).toEqual([]);
  });

  test('"delete my data" (DELETE /api/predict) also removes this browser\'s fields, and only its own', async () => {
    await post();
    await post({}, OTHER);
    const res = await request(app).delete('/api/predict').set('x-device-id', DEVICE);
    expect(res.status).toBe(200);
    expect((await list()).body).toEqual([]);
    expect((await list(OTHER)).body).toHaveLength(1);
  });
});

describe('GET /api/fields/alerts', () => {
  test('no fields: an empty list, and Open-Meteo is not called', async () => {
    const res = await alerts();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fields: [], weatherSource: expect.stringMatching(/Open-Meteo/) });
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('a frost night tomorrow gives a warning, a 72-hour strip and conditions; the weather call uses the 0.05° cell, not the exact point', async () => {
    const seen = [];
    mockMeteo(seen);
    const f = (await post()).body;
    const res = await alerts();
    expect(res.status).toBe(200);
    const [field] = res.body.fields;
    expect(field).toMatchObject({ _id: f._id, name: 'North plot', crop: 'wheat', stage: 'flowering', status: 'ok', timezone: 'Asia/Kolkata' });
    expect(field.alerts).toHaveLength(1);
    expect(field.alerts[0]).toMatchObject({ rule: 'FROST-WHEAT-1', level: 'warn', hazard: 'frost', date: add(indiaToday(), 1), reviewStatus: 'draft' });
    expect(field.horizon.days).toHaveLength(3);
    expect(field.horizon.days[1].slots[0].t).toBe(1.4);
    expect(field.conditions.coldest).toEqual({ t: 1.4, date: add(indiaToday(), 1) });
    expect(field.conditions.rain7).toBe(21); // the fixture has a 3 mm shower each night
    expect(res.body.checkedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ latitude: '30.85', longitude: '75.65' });
    expect(JSON.stringify(res.body)).not.toMatch(EXACT);
  });

  test('the stage decides: the same cold night is silent for wheat that is only growing', async () => {
    mockMeteo();
    const f = (await post({ stage: 'vegetative' })).body;
    const [field] = (await alerts()).body.fields;
    expect(field).toMatchObject({ _id: f._id, status: 'ok', alerts: [] });
  });

  test('two fields in one weather cell share one Open-Meteo call; fields of another browser are not listed', async () => {
    mockMeteo();
    await post({ name: 'a' });
    await post({ name: 'b', lat: LAT + 0.001 });
    await post({ name: 'not mine' }, OTHER);
    const res = await alerts();
    expect(res.body.fields.map((x) => x.name)).toEqual(['a', 'b']);
    expect(res.body.fields.every((x) => x.status === 'ok')).toBe(true);
    expect(nock.pendingMocks()).toEqual([]); // the one mock was used once
  });

  test('weather down: that field says so (status weather_unavailable), the others still answer, and the log has no coordinates', async () => {
    const errors = jest.spyOn(logger, 'error');
    nock('http://meteo.test').get('/v1/forecast').query((q) => q.latitude === '30.85').reply(503);
    nock('http://meteo.test').get('/v1/forecast').query((q) => q.latitude === '20.45').reply(200, meteo(false));
    await post({ name: 'down' });
    await post({ name: 'up', crop: 'rice', stage: 'vegetative', lat: 20.46, lon: 85.88 });
    const res = await alerts();
    expect(res.status).toBe(200);
    const [down, up] = res.body.fields;
    expect(down).toMatchObject({ name: 'down', status: 'weather_unavailable' });
    expect(down.alerts).toEqual([]); // no weather alerts; a river alert would still be listed here
    expect(up).toMatchObject({ name: 'up', status: 'ok', alerts: [] });
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(EXACT);
    expect(errors).toHaveBeenCalled();
  });

  test('an answer without hourly data (API change) is "weather unavailable", never an empty all-clear', async () => {
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, { utc_offset_seconds: 19800, error: true, reason: 'changed' });
    await post();
    const [field] = (await alerts()).body.fields;
    expect(field.status).toBe('weather_unavailable');
  });

  test('a forecast that has run out of hours is "weather unavailable"', async () => {
    const stale = meteo();
    stale.hourly.temperature_2m = stale.hourly.temperature_2m.map(() => null);
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, stale);
    await post();
    expect((await alerts()).body.fields[0].status).toBe('weather_unavailable');
  });

  test('a guest without a device id gets no fields and no weather call', async () => {
    const res = await request(app).get('/api/fields/alerts');
    expect(res.status).toBe(200);
    expect(res.body.fields).toEqual([]);
  });
});
