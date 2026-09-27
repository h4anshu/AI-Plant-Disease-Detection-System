import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import SoilCache from '../models/SoilCache.js';
import FieldHealthCache, { keyForPrediction } from '../models/FieldHealthCache.js';
import { WeatherCache } from '../services/openMeteo.js';
import logger from '../utils/logger.js';
import { parseLocation } from '../utils/geo.js';
import {
  addDays, attributions, CONTEXT_VERSION, daysFromEra5, daysFromHourly, istDate, parseCapturedAt, referenceDate,
  seasonOf, snapSoil, soilCacheKey, weatherSummary,
} from '../utils/context.js';
import { parseSoilTest, soilTestNote } from '../controllers/contextController.js';

const GUEST_ID = '000000000000000000000000';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const GEO = 'http://geo.test';
const METEO = 'http://meteo.test';
const LAT = '30.858816';
const LON = '75.666131';
const EXACT = /30\.8588|75\.6661/; // the exact point must never appear in answers, logs, caches or geo calls

// hourly Open-Meteo answer (local time) for [start, end]; humid nights, 26 °C days
const hourlyAnswer = (start, end) => {
  const time = [];
  for (let d = start; d <= end; d = addDays(d, 1)) for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, '0')}:00`);
  return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time,
    temperature_2m: time.map((t) => (Number(t.slice(11, 13)) < 6 ? 21 : 29)),
    relative_humidity_2m: time.map((t) => (Number(t.slice(11, 13)) < 10 ? 95 : 70)),
    precipitation: time.map(() => 0.1) } };
};
// the geo-service's answer (shape of geo-service/context.py query())
const SOIL = { depths: {}, topsoil0to30: { phH2O: 7.78, nitrogenGkg: 8.1, socGkg: 9.65, clayPct: 25.62, sandPct: 38.52, siltPct: 35.88 },
  texture: 'loam', label: 'modelled at 250 m (SoilGrids), not a soil test of this field' };
const RAIN = { status: 'ok', source: 'era5-land', windowStart: '2026-08-21', windowEnd: '2026-09-19', rainMm: 23.6, normalMm: 110.2, percentOfNormal: 21, baseline: '2001-2020' };
const geoAnswer = (body) => ({ soil: body.soil ? SOIL : null, rain_anomaly: RAIN, latest: { chirps: '2026-08-31', era5: '2026-09-19' },
  era5: body.era5_start ? [...Array(17)].map((_, i) => ({ date: addDays(body.era5_start, i), tmin: 21, tmean: 26, tmax: 31, rhMean: 82, rhMax: null, hoursRh90: null, rain: 2, source: 'era5-land' })) : null,
  parts: ['rain', ...(body.soil ? ['soil'] : []), ...(body.era5_start ? ['era5'] : [])] });

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
  await Promise.all([Prediction, SoilCache, FieldHealthCache, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  delete process.env.GEO_SERVICE_URL;
  await mongoose.disconnect();
  await mongod.stop();
  nock.enableNetConnect();
});

const today = () => istDate(new Date());
const checkup = (extra = {}) => Prediction.create({
  userId: GUEST_ID, deviceId: DEVICE, crop: 'rice', status: 'ok', disease: 'Bacterialblight', confidence: 0.9, severity: 'early',
  treatment: 't', imageUrl: 'https://x/y.jpg',
  top3: [{ disease: 'Bacterialblight', probability: 0.9 }, { disease: 'Blast', probability: 0.07 }, { disease: 'Tungro', probability: 0.02 }],
  ...parseLocation({ lat: LAT, lon: LON, accuracy_m: '12', location_source: 'gps' }), ...extra,
});
const get = (id, device = DEVICE) => {
  const req = request(app).get(`/api/predict/${id}/context`);
  return device ? req.set('x-device-id', device) : req;
};
const mockGeo = (seen = []) => nock(GEO).matchHeader('x-geo-token', 'test-geo-token')
  .post('/context', (b) => { seen.push(b); return true; }).reply(200, (uri, b) => geoAnswer(b));
const mockMeteo = (seen = []) => nock(METEO).get('/v1/forecast').query((q) => { seen.push(q); return true; })
  .reply(200, (uri) => {
    const q = Object.fromEntries(new URL(uri, METEO).searchParams);
    return q.start_date ? hourlyAnswer(q.start_date, q.end_date)
      : hourlyAnswer(addDays(today(), -Number(q.past_days)), addDays(today(), Number(q.forecast_days) - 1));
  });

describe('pure helpers', () => {
  const now = new Date('2026-09-27T06:00:00Z'); // 11:30 IST
  test('captured_at: kept when believable, else the reason', () => {
    expect(parseCapturedAt('2026-09-20', now)).toEqual({ capturedAt: '2026-09-20' });
    expect(parseCapturedAt('2026-09-27', now)).toEqual({ capturedAt: '2026-09-27' });
    expect(parseCapturedAt('2026-07-29', now)).toEqual({ capturedAt: '2026-07-29' }); // 60 days
    expect(parseCapturedAt('2026-07-28', now)).toEqual({ capturedAtRejected: 'too_old' }); // 61
    expect(parseCapturedAt('2026-09-28', now)).toEqual({ capturedAtRejected: 'future' });
    expect(parseCapturedAt('2026-02-30', now)).toEqual({ capturedAtRejected: 'invalid' });
    expect(parseCapturedAt('27/09/2026', now)).toEqual({ capturedAtRejected: 'invalid' });
    expect(parseCapturedAt(undefined, now)).toEqual({});
    expect(parseCapturedAt('', now)).toEqual({});
  });
  test('the reference date: EXIF date, else the checkup date in India', () => {
    expect(referenceDate({ capturedAt: '2026-09-20', createdAt: now })).toEqual({ date: '2026-09-20', source: 'exif' });
    expect(referenceDate({ createdAt: new Date('2026-09-26T20:00:00Z'), capturedAtRejected: 'future' }))
      .toEqual({ date: '2026-09-27', source: 'created_at', exifRejected: 'future' }); // 01:30 IST next day
  });
  test('hourly -> daily rows: 14 days up to the reference + 3 outlook; a day needs 20 hours', () => {
    const w = hourlyAnswer('2026-09-06', '2026-09-24');
    const w2 = { time: w.hourly.time, temp: w.hourly.temperature_2m, rh: w.hourly.relative_humidity_2m, rain: w.hourly.precipitation };
    // drop 5 hours of 2026-09-10: that day becomes a gap
    const cut = w2.time.map((t, i) => (t.startsWith('2026-09-10T0') && t < '2026-09-10T05' ? i : -1)).filter((i) => i >= 0);
    for (const i of cut) { w2.temp[i] = null; w2.rh[i] = null; }
    const days = daysFromHourly(w2, '2026-09-20', '2026-09-21');
    expect(days).toHaveLength(17);
    expect(days[0].date).toBe('2026-09-07');
    expect(days.at(-1).date).toBe('2026-09-23');
    expect(days.find((d) => d.date === '2026-09-20')).toEqual({ date: '2026-09-20', source: 'open-meteo', forecast: false,
      tmin: 21, tmean: 27, tmax: 29, rhMean: 80, rhMax: 95, hoursRh90: 10, rain: 2.4 }); // (10 x 95 + 14 x 70) / 24
    expect(days.find((d) => d.date === '2026-09-22').forecast).toBe(true);
    expect(days.find((d) => d.date === '2026-09-10')).toMatchObject({ tmean: null, hoursRh90: null });
    const s = weatherSummary(days, '2026-09-20');
    expect(s).toMatchObject({ days: 14, daysWithData: 13, tmeanMean: 27, rhMean: 80, hoursRh90: 130, wetDays12: 0, rainMm: 31.2 });
  });
  test('ERA5 rows fill the same shape; missing dates stay null', () => {
    const d = daysFromEra5([{ date: '2026-03-10', tmean: 20, tmin: 14, tmax: 27, rhMean: 60, rhMax: null, hoursRh90: null, rain: 0 }], '2026-03-10', '2026-09-27');
    expect(d).toHaveLength(17);
    expect(d.find((x) => x.date === '2026-03-10')).toMatchObject({ tmean: 20, hoursRh90: null, source: 'era5-land', forecast: false });
    expect(d.find((x) => x.date === '2026-03-09').tmean).toBeNull();
  });
  test('seasons from the cited calendar; October and March belong to two', () => {
    expect(seasonOf('2026-08-15').names).toEqual(['kharif']);
    expect(seasonOf('2026-10-15').names).toEqual(['kharif', 'rabi']);
    expect(seasonOf('2026-03-01').names).toEqual(['rabi', 'zaid']);
    expect(seasonOf('2026-05-01').names).toEqual(['zaid']);
  });
  test('soil cache key: one per ~250 m cell, a hash', () => {
    expect(snapSoil(30.858816)).toBe('30.8600');
    expect(soilCacheKey(30.858816, 75.666131)).toBe(soilCacheKey(30.8595, 75.6655));
    expect(soilCacheKey(30.858816, 75.666131)).not.toBe(soilCacheKey(30.8625, 75.666131));
    expect(soilCacheKey(30.858816, 75.666131)).toMatch(/^[0-9a-f]{64}$/);
  });
  test('attributions follow the sources used', () => {
    expect(attributions({ weatherSource: 'open-meteo', soil: true, rainSource: 'chirps', fieldHealth: false }, 2026)).toEqual([
      'Weather data by Open-Meteo.com (CC BY 4.0)', 'Rainfall: CHIRPS, Climate Hazards Center, UC Santa Barbara (public domain)',
      'Soil: ISRIC SoilGrids 250 m (CC BY 4.0)']);
    expect(attributions({ weatherSource: 'era5-land', soil: false, rainSource: 'era5-land', fieldHealth: true }, 2026)).toEqual([
      'Generated using Copernicus Climate Change Service information 2026 (ERA5-Land)',
      'Contains modified Copernicus Sentinel data processed by ESA / Google Earth Engine', 'Land cover: © ESA WorldCover project 2021 (CC BY 4.0)']);
  });
  test('Soil Health Card input: numbers in range, a real date, nothing else', () => {
    const t = new Date('2026-09-27T06:00:00Z');
    expect(parseSoilTest({ ph: '6.5', availableN: 250, sampleDate: '2025-01-10' }, t))
      .toEqual({ soilTest: { ph: 6.5, availableN: 250, sampleDate: '2025-01-10', enteredAt: t.toISOString() } });
    expect(parseSoilTest({ ph: 12 }, t).error).toMatch(/ph must be a number from 3 to 11/);
    expect(parseSoilTest({ zn: 'lots' }, t).error).toMatch(/zn must be a number/);
    expect(parseSoilTest({ cardNumber: 'AB12', ph: 7 }, t).error).toBe('Unknown field(s): cardNumber');
    expect(parseSoilTest({}, t).error).toBe('Enter at least one value from the card');
    expect(parseSoilTest({ ph: 7, sampleDate: '2027-01-01' }, t).error).toMatch(/sampleDate/);
    expect(parseSoilTest({ ph: 7, sampleDate: '2014-12-31' }, t).error).toMatch(/sampleDate/);
    expect(parseSoilTest({ ph: 7, sampleDate: '2025-02-30' }, t).error).toMatch(/sampleDate/);
    expect(parseSoilTest([1], t).error).toBeTruthy();
    expect(soilTestNote({ sampleDate: '2024-01-01' }, '2026-09-20')).toBe('older_than_retest_interval');
    expect(soilTestNote({ sampleDate: '2025-01-01' }, '2026-09-20')).toBeNull();
    expect(soilTestNote(null, '2026-09-20')).toBeNull();
  });
});

describe('GET /api/predict/:id/context', () => {
  test('first open builds and stores the snapshot (Open-Meteo + one geo call); the next open costs nothing', async () => {
    const p = await checkup();
    const geoSeen = [];
    const meteoSeen = [];
    const geo = mockGeo(geoSeen);
    const meteo = mockMeteo(meteoSeen);
    const info = jest.spyOn(logger, 'info');
    const first = await get(p._id);
    expect(first.status).toBe(200);
    expect(geo.isDone() && meteo.isDone()).toBe(true);
    const c = first.body.context;
    expect(c).toMatchObject({ version: CONTEXT_VERSION, reference: { date: today(), source: 'created_at' },
      weather: { source: 'open-meteo', gaps: [] }, rainAnomaly: { percentOfNormal: 21 }, soil: { texture: 'loam' },
      fieldHealth: { status: 'not_requested' }, season: { source_id: 'ies-seasons' } });
    expect(c.weather.days).toHaveLength(17);
    expect(c.provenance.attributions).toContain('Soil: ISRIC SoilGrids 250 m (CC BY 4.0)');
    expect(c.provenance.eecuEstimate).toBe(4.05); // soil + ERA5-Land rainfall anomaly (measured)
    // the geo-service gets the ~250 m cell centre, never the exact point; Open-Meteo the 0.05° grid point
    expect(geoSeen[0]).toEqual({ lat: 30.86, lon: 75.665, soil: true, rain_ref: today() });
    expect(meteoSeen[0]).toMatchObject({ latitude: '30.85', longitude: '75.65', past_days: '14' });
    // fit for the diagnosis and both alternatives, all drafts
    expect(first.body.fit.diagnosed).toMatchObject({ class: 'Bacterialblight', level: 'favourable' });
    expect(first.body.fit.alternatives.map((a) => a.class)).toEqual(['Blast', 'Tungro']);
    expect(first.body.fit.alternatives[0].model).toMatchObject({ key: 'diseaseRisk:yoshino', name: 'Yoshino infection hours' });
    expect(first.body.fit.alternatives[1]).toMatchObject({ level: 'unknown', reason: 'no_rules' });
    expect(first.body).toMatchObject({ draft: true, cached: false, soilTest: null });
    // no exact coordinates in the answer, the stored snapshot, the soil cache or the log line
    expect(JSON.stringify(first.body)).not.toMatch(EXACT);
    const stored = await Prediction.findById(p._id).lean();
    expect(stored.context.computedAt).toBe(c.computedAt);
    expect(JSON.stringify(stored.context)).not.toMatch(EXACT);
    const [soil] = await SoilCache.find().lean();
    expect(soil.key).toBe(soilCacheKey(30.858816, 75.666131));
    expect(JSON.stringify(soil)).not.toMatch(/30\.8|75\.6/);
    const line = info.mock.calls.find(([, msg]) => msg === 'context')[0];
    expect(line).toMatchObject({ crop: 'rice', weather: 'open-meteo', rain: 'ok', soil: true, fit: 'favourable' });
    expect(JSON.stringify(line)).not.toMatch(EXACT);

    const second = await get(p._id); // no interceptors left: any outside call would fail the test
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.context).toEqual(c);
  });

  test('a second checkup in the same ~250 m cell does not ask for soil again', async () => {
    await SoilCache.create({ key: soilCacheKey(30.858816, 75.666131), result: { soil: SOIL } });
    const p = await checkup();
    const seen = [];
    mockGeo(seen);
    mockMeteo();
    const r = await get(p._id);
    expect(r.status).toBe(200);
    expect(seen[0].soil).toBe(false);
    expect(r.body.context.soil.texture).toBe('loam');
    expect(r.body.context.provenance.eecuEstimate).toBe(4); // rainfall only
  });

  test('the photo date from EXIF drives the weather window (Open-Meteo date range)', async () => {
    const shot = addDays(today(), -20);
    const p = await checkup({ capturedAt: shot });
    const meteoSeen = [];
    const geoSeen = [];
    mockGeo(geoSeen);
    mockMeteo(meteoSeen);
    const r = await get(p._id);
    expect(r.status).toBe(200);
    expect(r.body.context.reference).toEqual({ date: shot, source: 'exif' });
    expect(meteoSeen[0]).toMatchObject({ start_date: addDays(shot, -14), end_date: addDays(shot, 4) });
    expect(geoSeen[0].rain_ref).toBe(shot);
    expect(r.body.context.weather.days.at(-1).date).toBe(addDays(shot, 3));
  });

  test('older than Open-Meteo can serve: ERA5-Land days from the geo-service, no hourly-only rules', async () => {
    const p = await checkup({ createdAt: new Date(Date.now() - 200 * 86400e3) });
    const ref = istDate(p.createdAt);
    const seen = [];
    mockGeo(seen); // no Open-Meteo mock: calling it would fail
    const r = await get(p._id);
    expect(r.status).toBe(200);
    expect(seen[0]).toMatchObject({ era5_start: addDays(ref, -13), era5_end: addDays(ref, 3) });
    const c = r.body.context;
    expect(c.weather.source).toBe('era5-land');
    expect(c.provenance.attributions.some((a) => a.startsWith('Generated using Copernicus Climate Change Service information'))).toBe(true);
    expect(c.provenance.sources[0]).toMatchObject({ cx: 'CX-02', dataset: 'ECMWF/ERA5_LAND/DAILY_AGGR' });
    // the published blast model needs hourly weather: unknown, said so
    expect(r.body.fit.alternatives[0]).toMatchObject({ class: 'Blast', level: 'unknown', reason: 'needs_hourly_weather' });
  });

  test('a cached field-health answer is included; it is never requested from here', async () => {
    const p = await checkup();
    await FieldHealthCache.create({ key: keyForPrediction(p), result: { flag: { code: 'below', since: '2026-09-13', stale: false },
      last_clear_date: '2026-09-18', latest: { ndvi: 0.55, z: -1.6 }, window: { start: '2026-05-29', end: '2026-09-26' } } });
    mockGeo();
    mockMeteo();
    const r = await get(p._id);
    expect(r.body.context.fieldHealth).toMatchObject({ status: 'cached', verdict: 'below', lastClearDate: '2026-09-18', latestNdvi: 0.55, latestZ: -1.6 });
    expect(r.body.context.provenance.attributions).toContain('Land cover: © ESA WorldCover project 2021 (CC BY 4.0)');
  });

  test('an older snapshot version is rebuilt once', async () => {
    const p = await checkup({ context: { version: CONTEXT_VERSION - 1, stale: true } });
    mockGeo();
    mockMeteo();
    const r = await get(p._id);
    expect(r.status).toBe(200);
    expect(r.body.context.version).toBe(CONTEXT_VERSION);
    expect((await Prediction.findById(p._id).lean()).context.stale).toBeUndefined();
  });

  test('no location or no diagnosis -> 409; not yours / no device / bad id -> 404', async () => {
    const noLoc = await checkup({ location: undefined, geoCell: null, locationSource: 'none' });
    expect((await get(noLoc._id)).status).toBe(409);
    const rejected = await checkup({ status: 'rejected_quality', disease: undefined, confidence: undefined, severity: undefined, treatment: undefined });
    expect((await get(rejected._id)).status).toBe(409);
    const p = await checkup();
    expect((await get(p._id, OTHER)).status).toBe(404);
    expect((await get(p._id, null)).status).toBe(404);
    expect((await get('nope')).status).toBe(404);
  });

  test('geo-service busy -> 503, failing -> 502, weather down -> 502; nothing is stored', async () => {
    const p = await checkup();
    nock(GEO).post('/context').reply(503, { detail: 'Earth Engine error' });
    mockMeteo();
    const busy = await get(p._id);
    expect(busy.status).toBe(503);
    expect(busy.body.message).toMatch(/busy/);
    nock.cleanAll();
    nock(GEO).post('/context').reply(502, { detail: 'Earth Engine error' });
    mockMeteo();
    expect((await get(p._id)).status).toBe(502);
    nock.cleanAll();
    await WeatherCache.deleteMany({}); // the previous step's weather answer was cached (as it should be)
    mockGeo();
    nock(METEO).get('/v1/forecast').query(true).reply(500, 'boom');
    const weather = await get(p._id);
    expect(weather.status).toBe(502);
    expect(weather.body.message).toMatch(/Weather/);
    expect((await Prediction.findById(p._id).lean()).context).toBeUndefined();
  });

  test('without a configured geo-service -> 503 and nothing stored', async () => {
    const p = await checkup();
    delete process.env.GEO_SERVICE_URL;
    try {
      expect((await get(p._id)).status).toBe(503);
    } finally {
      process.env.GEO_SERVICE_URL = GEO;
    }
  });
});

describe('Soil Health Card values and "Delete my data"', () => {
  test('the farmer\'s card values change the fit (nutrients read only from the card) and are private to the device', async () => {
    const p = await checkup({ crop: 'groundnut', disease: 'Nutrition_Deficiency', top3: undefined });
    mockGeo();
    mockMeteo();
    const before = await get(p._id);
    expect(before.body.fit.diagnosed).toMatchObject({ level: 'unknown', reason: 'missing_data' });
    const patch = (body, device = DEVICE) => request(app).patch(`/api/predict/${p._id}/soil-test`).set('x-device-id', device).send(body);
    expect((await patch({ availableN: 9999 })).status).toBe(400);
    expect((await patch({ zn: 0.3 }, OTHER)).status).toBe(404);
    const r = await patch({ zn: 0.3, availableN: 350, sampleDate: '2023-06-01' });
    expect(r.status).toBe(200);
    expect(r.body.fit.diagnosed).toMatchObject({ level: 'favourable' });
    expect(r.body.fit.diagnosed.matched[0]).toMatchObject({ factor: 'soilTest.zn', actual: 0.3, from: 'soil_test' });
    expect(r.body.soilTestNote).toBe('older_than_retest_interval');
    expect((await get(p._id)).body.soilTest).toMatchObject({ zn: 0.3, availableN: 350 });
    // history does not carry the ~5 KB snapshot
    const hist = await request(app).get('/api/predict').set('x-device-id', DEVICE);
    expect(hist.body[0].context).toBeUndefined();
  });

  test('"Delete my data" removes the snapshots with the checkups and the soil cached for those cells', async () => {
    const p = await checkup();
    mockGeo();
    mockMeteo();
    await get(p._id);
    await SoilCache.create({ key: soilCacheKey(12.9, 77.6), result: { soil: SOIL } }); // someone else's cell
    const del = await request(app).delete('/api/predict').set('x-device-id', DEVICE);
    expect(del.status).toBe(200);
    expect(await Prediction.countDocuments()).toBe(0);
    expect((await SoilCache.find().lean()).map((s) => s.key)).toEqual([soilCacheKey(12.9, 77.6)]);
  });
});
