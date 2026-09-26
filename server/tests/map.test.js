import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import sharp from 'sharp';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import { H3_RESOLUTION, parseLocation } from '../utils/geo.js';
import { demoPredictions, isLocalMongo } from '../scripts/seed_demo_map.js';

const GUEST_ID = '000000000000000000000000';
const dev = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// three fields ~100 m apart share one ~5 km^2 cell; FAR is a different district
const NEAR = [[30.9001, 75.8501], [30.9004, 75.8497], [30.8998, 75.8505]];
const FAR = [23.52, 77.81];
const DAY = 86_400_000;

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
afterEach(async () => {
  nock.cleanAll();
  delete process.env.MAP_INCLUDE_DEMO;
  await Prediction.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  nock.enableNetConnect();
});

const report = ({ at = NEAR[0], device = dev(1), crop = 'wheat', disease = 'LeafBlight', status = 'ok', ageDays = 1, ...rest } = {}) =>
  Prediction.create({
    userId: GUEST_ID, deviceId: device, crop, disease, status, confidence: 0.9, severity: 'moderate', treatment: 't',
    imageUrl: 'https://res.cloudinary.com/test-cloud/image/upload/v1/plant-disease/leaf.jpg',
    ...parseLocation({ lat: String(at[0]), lon: String(at[1]), accuracy_m: '15', location_source: 'gps' }),
    createdAt: new Date(Date.now() - ageDays * DAY), ...rest,
  });
const reports = (query = {}) => request(app).get('/api/map/reports').query(query);

describe('GET /api/map/reports', () => {
  test('counts reports per H3 hexagon as GeoJSON, without any raw point', async () => {
    for (const [i, at] of NEAR.entries()) await report({ at, device: dev(i) });
    await report({ at: NEAR[0], device: dev(0) }); // a second leaf from the same farmer
    const res = await reports();
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(1);
    const [cell] = res.body.features;
    expect(cell.properties).toEqual({ reports: 4 }); // no device count, no ids
    expect(cell.geometry.type).toBe('Polygon');
    const ring = cell.geometry.coordinates[0];
    expect(ring).toHaveLength(7); // hexagon, closed
    expect(ring[0]).toEqual(ring[6]);
    expect(JSON.stringify(res.body)).not.toMatch(/30\.900[148]|75\.8(501|497|505)/);
    expect(res.body.meta).toMatchObject({ days: 30, resolution: H3_RESOLUTION, minDevices: 3, demo: false });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  test('suppression counts distinct browsers, not reports', async () => {
    for (let i = 0; i < 5; i++) await report({ device: dev(9) }); // one farmer, five leaves
    for (let i = 0; i < 2; i++) await report({ at: FAR, device: dev(20 + i) }); // two farmers
    expect((await reports()).body.features).toEqual([]);
    await report({ at: FAR, device: dev(22) }); // the third browser in that cell
    const { features } = (await reports()).body;
    expect(features).toHaveLength(1);
    expect(features[0].properties.reports).toBe(3);
  });

  test('guests without a device id count as a single browser', async () => {
    for (let i = 0; i < 4; i++) await report({ device: null });
    await report({ device: dev(1) });
    expect((await reports()).body.features).toEqual([]); // 2 "browsers", not 5
  });

  test('filters by crop, disease and time window; healthy leaves and non-diagnoses are left out', async () => {
    const three = async (extra) => { for (let i = 0; i < 3; i++) await report({ device: dev(i), ...extra }); };
    await three({ ageDays: 40 });
    expect((await reports()).body.features).toHaveLength(0);
    expect((await reports({ days: 90 })).body.features).toHaveLength(1);
    await Prediction.deleteMany({});

    await three({ disease: 'HealthyLeaf' });
    await three({ status: 'uncertain' });
    expect((await reports()).body.features).toHaveLength(0);
    expect((await reports({ crop: 'wheat', disease: 'HealthyLeaf' })).body.features).toHaveLength(1);
    await three({ crop: 'rice', disease: 'Blast' });
    expect((await reports({ crop: 'rice' })).body.features[0].properties.reports).toBe(3);
    expect((await reports({ crop: 'wheat' })).body.features).toHaveLength(0);
    expect((await reports({ crop: 'rice', disease: 'Tungro' })).body.features).toHaveLength(0);
  });

  test.each([
    [{ days: 14 }], [{ days: 'all' }], [{ crop: 'mango' }], [{ disease: 'Blast' }], [{ crop: 'rice', disease: 'LeafBlight' }],
  ])('rejects %j with 400', async (query) => {
    expect((await reports(query)).status).toBe(400);
  });

  test('rejects repeated parameters (arrays)', async () => {
    expect((await request(app).get('/api/map/reports?crop=wheat&crop=rice')).status).toBe(400);
  });

  test('demo records never appear unless a non-production server asks for them', async () => {
    for (let i = 0; i < 3; i++) await report({ device: dev(i), demo: true });
    expect((await reports()).body.features).toHaveLength(0);
    process.env.MAP_INCLUDE_DEMO = 'true';
    const withDemo = (await reports()).body;
    expect(withDemo.features).toHaveLength(1);
    expect(withDemo.meta.demo).toBe(true);
    process.env.NODE_ENV = 'production';
    try {
      expect((await reports()).body.features).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });
});

describe('location on a prediction', () => {
  let JPEG;
  beforeAll(async () => {
    JPEG = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#3a7d2c' } }).jpeg().toBuffer();
  });
  const ML_OK = { status: 'ok', reasons: [], disease: 'LeafBlight', confidence: 0.95, severity: 'moderate', gradcam: null };
  const predictWith = (fields) => {
    const req = request(app).post('/api/predict').set('x-device-id', dev(1)).field('crop', 'wheat');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('image', JPEG, { filename: 'leaf.jpg', contentType: 'image/jpeg' });
  };
  const mockUpstream = () => {
    nock('http://ml.test').post('/predict-disease').reply(200, ML_OK);
    nock('https://api.cloudinary.com').post(/image\/upload/).reply(200, { secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/plant-disease/x.jpg' });
  };

  test('a consented GPS fix is stored as a GeoJSON point + H3 cell, and never returned', async () => {
    mockUpstream();
    const res = await predictWith({ lat: '30.9001', lon: '75.8501', accuracy_m: '12.5', location_source: 'gps' });
    expect(res.status).toBe(201);
    expect(res.body.locationSource).toBe('gps');
    for (const f of ['location', 'locationAccuracyM', 'geoCell']) expect(res.body).not.toHaveProperty(f);
    const saved = await Prediction.findById(res.body._id).lean();
    expect(saved.location).toEqual({ type: 'Point', coordinates: [75.8501, 30.9001] });
    expect(saved).toMatchObject({ locationAccuracyM: 12.5, geoCell: expect.stringMatching(/^87/) });
    const history = await request(app).get('/api/predict').set('x-device-id', dev(1));
    expect(JSON.stringify(history.body)).not.toMatch(/30\.9001|75\.8501|coordinates/);
  });

  test('"none" (skipped) stores no location even if coordinates are sent', async () => {
    mockUpstream();
    const res = await predictWith({ lat: '30.9', lon: '75.8', location_source: 'none' });
    const saved = await Prediction.findById(res.body._id).lean();
    expect(saved.location).toBeUndefined();
    expect(saved).toMatchObject({ locationSource: 'none', geoCell: null });
  });

  test('an EXIF location needs no accuracy', async () => {
    mockUpstream();
    const res = await predictWith({ lat: '23.52', lon: '77.81', location_source: 'exif' });
    expect((await Prediction.findById(res.body._id).lean())).toMatchObject({ locationSource: 'exif', locationAccuracyM: null });
  });

  test.each([
    [{ lat: '91', lon: '75', location_source: 'gps' }],
    [{ lat: '30', lon: '-181', location_source: 'gps' }],
    [{ lat: '', lon: '75', location_source: 'gps' }],
    [{ lat: 'abc', lon: '75', location_source: 'gps' }],
    [{ lat: '30', lon: '75', accuracy_m: '-5', location_source: 'gps' }],
    [{ lat: '30', lon: '75', location_source: 'satellite' }],
  ])('invalid location %j -> 400 before any ML call', async (fields) => {
    const ml = nock('http://ml.test').post('/predict-disease').reply(200, ML_OK);
    expect((await predictWith(fields)).status).toBe(400);
    expect(ml.isDone()).toBe(false);
  });
});

describe('DELETE /api/predict (my data)', () => {
  test("deletes this browser's records and their Cloudinary files, nobody else's; the map drops them", async () => {
    for (const [i, at] of NEAR.entries()) await report({ at, device: dev(i), gradcam: 'https://res.cloudinary.com/test-cloud/image/upload/v2/plant-disease/gradcam/c.png' });
    await report({ device: dev(0) });
    expect((await reports()).body.features).toHaveLength(1);

    const destroyed = [];
    nock('https://api.cloudinary.com').post('/v1_1/test-cloud/image/destroy').times(3)
      .reply(200, (uri, body) => { destroyed.push(String(body)); return { result: 'ok' }; });
    const res = await request(app).delete('/api/predict').set('x-device-id', dev(0));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
    expect(destroyed).toHaveLength(3); // 2 photos + the 1 heatmap (the second record has none)
    expect(destroyed.join()).toMatch(/plant-disease%2Fleaf|plant-disease\/leaf/);
    expect(await Prediction.countDocuments({ deviceId: dev(0) })).toBe(0);
    expect(await Prediction.countDocuments()).toBe(2);
    expect((await reports()).body.features).toHaveLength(0); // 2 browsers left: suppressed again
  });

  test('without a device id -> 400, nothing deleted', async () => {
    await report({ device: dev(1) });
    expect((await request(app).delete('/api/predict')).status).toBe(400);
    expect(await Prediction.countDocuments()).toBe(1);
  });
});

describe('demo seed (scripts/seed_demo_map.js)', () => {
  test.each([
    ['mongodb://127.0.0.1:27017/plantdisease', true],
    ['mongodb://localhost/x', true],
    ['mongodb+srv://cluster0.example.mongodb.net/prod', false], // an Atlas-style remote URI (no credentials: GitHub secret scanning flags any)
    ['mongodb://db.example.com:27017/x', false],
    ['mongodb://localhost:1,db.example.com:2/x', false],
    ['', false],
  ])('%s local=%s', (uri, local) => {
    expect(isLocalMongo(uri)).toBe(local);
  });

  test('every seeded record is flagged demo and valid; sparse districts stay hidden on the map', async () => {
    const docs = demoPredictions();
    expect(docs.length).toBeGreaterThan(100);
    expect(docs.every((d) => d.demo === true && d.geoCell && d.imageUrl.includes('example.invalid'))).toBe(true);
    await Prediction.insertMany(docs);
    process.env.MAP_INCLUDE_DEMO = 'true';
    const { features } = (await reports({ days: 90 })).body;
    const cellsWithReports = new Set(docs.filter((d) => !/healthy/i.test(d.disease)).map((d) => d.geoCell)).size;
    expect(features.length).toBeGreaterThan(5);
    expect(features.length).toBeLessThan(cellsWithReports); // some cells have < 3 farmers and are suppressed
  });
});
