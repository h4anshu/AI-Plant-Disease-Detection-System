// Rule functions on hand-made weather series, one test per threshold edge (docs/DISEASE_RISK.md),
// then the API with Open-Meteo mocked.
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import { WeatherCache } from '../services/openMeteo.js';
import { parseLocation } from '../utils/geo.js';
import {
  assess, baseWetHours, blitecastInterval, dailyAggregates, indoBlightcast, isWet, padmanabhanStreaks,
  pDay, pRate, wallinDaily, wallinSV, yoshinoHours, yoshinoLevel,
} from '../utils/diseaseRisk.js';

// hourly local series from 2026-10-01 00:00: at(dayIndex, hour) -> { temp, rh, rain }
const START = Date.UTC(2026, 9, 1);
function series(nDays, at) {
  const w = { time: [], temp: [], rh: [], rain: [] };
  for (let d = 0; d < nDays; d++) {
    for (let h = 0; h < 24; h++) {
      const { temp, rh, rain = 0 } = at(d, h);
      w.time.push(new Date(START + (d * 24 + h) * 3600e3).toISOString().slice(0, 13) + ':00');
      w.temp.push(temp); w.rh.push(rh); w.rain.push(rain);
    }
  }
  return w;
}
const constant = (temp, rh, rain = 0) => () => ({ temp, rh, rain });

describe('P-days (Sands et al. 1979)', () => {
  test('cardinal temperatures 7 / 21 / 30 °C', () => {
    expect(pRate(6.9)).toBe(0);
    expect(pRate(7)).toBe(0);
    expect(pRate(21)).toBe(10);
    expect(pRate(30)).toBe(0);
    expect(pRate(30.1)).toBe(0);
    expect(pDay(21, 21)).toBe(10);
    expect(pDay(14, 14)).toBeCloseTo(7.5, 10); // 10 * (1 - 49/196)
  });
});

describe('INDO-BLIGHTCAST: 7-day sums must EXCEED 52.5 P-days and 525 night RH', () => {
  const levels = (temp, rh) => indoBlightcast(dailyAggregates(series(16, constant(temp, rh))));
  test('P-days exactly 52.5 -> not favourable (low)', () => {
    const r = levels(14, 95);
    expect(r[6].pdays7).toBe(52.5);
    expect(r[6].level).toBe('low');
  });
  test('night RH exactly 525 -> not favourable (low)', () => {
    const r = levels(14.1, 75);
    expect(r[6].nightRh7).toBe(525);
    expect(r[6].level).toBe('low');
  });
  test('both just above -> medium while building up, high on the 7th consecutive favourable day', () => {
    const r = levels(14.1, 75.1);
    expect(r[5].level).toBeNull(); // fewer than 7 days of data yet
    expect(r[6]).toMatchObject({ level: 'medium', favourableRun: 1 });
    expect(r[11]).toMatchObject({ level: 'medium', favourableRun: 6 });
    expect(r[12]).toMatchObject({ level: 'high', favourableRun: 7 });
    expect(r[15].level).toBeNull(); // the last night is incomplete
  });
  test('a cold day breaks the run', () => {
    const w = series(16, (d) => ({ temp: d === 9 ? 5 : 14.1, rh: 80 }));
    const r = indoBlightcast(dailyAggregates(w));
    expect(r[8].favourableRun).toBe(3);
    expect(r[9].level).toBe('low'); // the P-day sum falls to 7 x ... with a 0 day
    expect(r[12].level).toBe('low');
  });
  test('night = 18:00 to 05:00 of the next morning', () => {
    const w = series(3, (d, h) => ({ temp: 15, rh: h >= 18 || h < 6 ? 95 : 40 }));
    const days = dailyAggregates(w);
    expect(days[0].nightRh).toBe(95);
    expect(days[2].nightRh).toBeNull(); // no next morning in the data
  });
});

describe('Wallin severity values: SV = floor((h - 1) / 3) - k per °F band', () => {
  test.each([
    [10, 15, 0], [10, 16, 1], [10, 18, 1], [10, 19, 2], [10, 25, 4], [10, 27, 4], [10, 28, 5], // 45-54 °F
    [13, 12, 0], [13, 13, 1], [13, 22, 4], [13, 24, 4], [13, 25, 5], // 55-59 °F
    [20, 9, 0], [20, 10, 1], [20, 21, 4], [20, 22, 5], // 60-81 °F
    [6.9, 40, 0], [27.5, 40, 0], // outside 45-81 °F
    [7.2, 16, 1], [27.2, 10, 1], // band edges round into the bands
  ])('%s °C for %s h -> SV %s', (temp, hours, sv) => {
    expect(wallinSV(hours, temp)).toBe(sv);
  });
  test('a period counts on the date it ends', () => {
    // RH >= 90 from day 1 18:00 to day 2 13:00 = 20 h at 20 °C -> SV 4 on day 2
    const w = series(3, (d, h) => ({ temp: 20, rh: (d === 1 && h >= 18) || (d === 2 && h <= 13) ? 95 : 60 }));
    const sv = wallinDaily(w);
    expect(sv.get('2026-10-02')).toBeUndefined();
    expect(sv.get('2026-10-03')).toBe(4);
  });
  test.each([
    [6, 0, '5-day'], [5, 29.9, '7-day'], [5, 30, '5-day'], [4, 30, '7-day'], [4, 29.9, '10+ day'], [3, 30, '10+ day'],
  ])('BLITECAST: 7-day SV %s with %s mm rain -> %s spray interval', (sv7, rain7, interval) => {
    expect(blitecastInterval(sv7, rain7)).toBe(interval);
  });
});

describe('Yoshino infection hours', () => {
  test('wetness proxy: RH >= 90% or rain >= 0.1 mm', () => {
    expect(isWet(89.9, 0)).toBe(false);
    expect(isWet(90, 0)).toBe(true);
    expect(isWet(50, 0.1)).toBe(true);
    expect(isWet(50, 0.09)).toBe(false);
  });
  test('base wet hours equation', () => {
    expect(baseWetHours(24)).toBeCloseTo(9.928, 3);
    expect(baseWetHours(20)).toBeCloseTo(11.202, 3);
  });
  // 6 dry days, then wet from day 6 18:00 for 30 h, everything at `temp`
  const wetRun = (temp, rainAt = () => 0) => series(9, (d, h) => {
    const i = d * 24 + h;
    const wet = i >= 6 * 24 + 18 && i < 6 * 24 + 18 + 30;
    return { temp, rh: wet ? 95 : 60, rain: wet ? rainAt(i) : 0 };
  });
  const firstInfectionRunHour = (w) => {
    const flags = yoshinoHours(w);
    const start = 6 * 24 + 18;
    return flags.findIndex((f, i) => f && i >= start) - start + 1;
  };
  test('24 °C: the wet run must last base (9.93 h) + 4 = 13.93 h -> hour 14 is the first infection hour', () => {
    expect(firstInfectionRunHour(wetRun(24))).toBe(14);
  });
  test.each([[19.9, false], [20, true], [25, true], [25.1, false]])('5-day mean %s °C -> infection possible: %s', (temp, ok) => {
    expect(yoshinoHours(wetRun(temp)).some(Boolean)).toBe(ok);
  });
  test('an hour with 4 mm rain is still wet but not an infection hour; 3.9 mm is', () => {
    const at = 6 * 24 + 18 + 20; // run hour 21
    expect(yoshinoHours(wetRun(24, (i) => (i === at ? 4 : 0)))[at]).toBe(false);
    expect(yoshinoHours(wetRun(24, (i) => (i === at ? 3.9 : 0)))[at]).toBe(true);
    expect(yoshinoHours(wetRun(24, (i) => (i === at ? 4 : 0)))[at + 1]).toBe(true); // the run continues
  });
  test.each([[0, 'low'], [2, 'low'], [3, 'medium'], [5, 'medium'], [6, 'high']])('DIWH %s -> %s', (h, level) => {
    expect(yoshinoLevel(h)).toBe(level);
  });
});

describe('Padmanabhan (1965): Tmin < 24 °C with RH >= 90%, 4 days', () => {
  test('edges and the streak', () => {
    const days = [
      { date: 'a', tmin: 23.9, rhMax: 90 }, { date: 'b', tmin: 23.9, rhMax: 95 }, { date: 'c', tmin: 24.0, rhMax: 95 },
      { date: 'd', tmin: 22, rhMax: 95 }, { date: 'e', tmin: 22, rhMax: 89.9 }, { date: 'f', tmin: 22, rhMax: 92 },
    ];
    expect([...padmanabhanStreaks(days).values()]).toEqual([1, 2, 0, 1, 0, 1]);
  });
});

describe('assess()', () => {
  test('potato: 6 days (2 past, today, 3 ahead) with conditions and citation', () => {
    const r = assess('potato', series(18, constant(14.1, 80)), '2026-10-15');
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(r.days.map((d) => d.forecast)).toEqual([false, false, false, true, true, true]);
    expect(r.days[2]).toMatchObject({ level: 'high', conditions: { favourableRun: 9, thresholds: { pdays7: 52.5 } } });
    expect(r.days[5].level).toBeNull(); // last night not in the data
    expect(r.label).toBe('risk indicator, not a forecast of infection');
    expect(r.model.citation).toMatch(/Govindakrishnan/);
  });
  test('rice: Yoshino level with the Padmanabhan streak alongside', () => {
    const r = assess('rice', series(18, constant(22, 95)), '2026-10-15');
    expect(r.days[2]).toMatchObject({ level: 'high', conditions: { infectionHours: 24, padmanabhanMet: true } });
    expect(r.supporting.name).toMatch(/Padmanabhan/);
  });
});

// ---- API ------------------------------------------------------------------------------------------

describe('API', () => {
  let mongod;
  const GUEST_ID = '000000000000000000000000';
  const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
  const meteo = (w = series(18, constant(14.1, 80))) => ({
    utc_offset_seconds: 19800, timezone: 'Asia/Kolkata',
    hourly: { time: w.time, temperature_2m: w.temp, relative_humidity_2m: w.rh, precipitation: w.rain },
  });
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });
  afterEach(async () => {
    nock.cleanAll();
    await WeatherCache.deleteMany({});
    await Prediction.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    nock.enableNetConnect();
  });

  test('public: asks Open-Meteo with a ~5 km grid point, answers with levels, label, citation, attribution; cached per hour', async () => {
    let params;
    const om = nock('http://meteo.test').get('/v1/forecast').query((q) => { params = q; return true; }).reply(200, meteo());
    const r = await request(app).get('/api/disease-risk').query({ lat: 30.8588, lon: 75.6661, crop: 'potato' });
    expect(r.status).toBe(200);
    expect(om.isDone()).toBe(true);
    expect(params).toMatchObject({ latitude: '30.85', longitude: '75.65', past_days: '14', forecast_days: '5', timezone: 'auto' });
    expect(r.body).toMatchObject({ crop: 'potato', label: 'risk indicator, not a forecast of infection',
      weatherSource: expect.stringMatching(/Open-Meteo/), model: { name: expect.stringMatching(/INDO-BLIGHTCAST/) } });
    expect(r.body.days).toHaveLength(6);
    // same ~5 km cell, same hour: served from the cache (no interceptor left)
    const again = await request(app).get('/api/disease-risk').query({ lat: 30.8612, lon: 75.6649, crop: 'rice' });
    expect(again.status).toBe(200);
    expect(again.body.model.name).toMatch(/Yoshino/);
  });

  test.each([
    [{ lat: 30, lon: 75, crop: 'wheat' }], [{ lat: 95, lon: 75, crop: 'rice' }], [{ lat: 'x', lon: 75, crop: 'rice' }], [{ lon: 75, crop: 'rice' }],
  ])('invalid %j -> 400, no weather call', async (query) => {
    expect((await request(app).get('/api/disease-risk').query(query)).status).toBe(400);
  });

  test('Open-Meteo down -> 502 with a friendly message', async () => {
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    const r = await request(app).get('/api/disease-risk').query({ lat: 30, lon: 75, crop: 'rice' });
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/Weather data is unavailable/);
  });

  test('checkup route: uses the private location; no location 409, other crops 422, not yours 404', async () => {
    const base = { userId: GUEST_ID, deviceId: DEVICE, status: 'ok', disease: 'Late_blight', confidence: 0.9,
      severity: 'early', treatment: 't', imageUrl: 'https://x/y.jpg' };
    const loc = parseLocation({ lat: '30.8588', lon: '75.6661', location_source: 'gps' });
    const potato = await Prediction.create({ ...base, crop: 'potato', ...loc });
    const noLoc = await Prediction.create({ ...base, crop: 'potato' });
    const wheat = await Prediction.create({ ...base, crop: 'wheat', disease: 'LeafBlight', ...loc });
    nock('http://meteo.test').get('/v1/forecast').query((q) => q.latitude === '30.85').reply(200, meteo());
    const get = (p, device = DEVICE) => request(app).get(`/api/predict/${p._id}/disease-risk`).set('x-device-id', device);
    const ok = await get(potato);
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toMatch(/30\.8588|75\.6661/);
    expect((await get(noLoc)).status).toBe(409);
    expect((await get(wheat)).status).toBe(422);
    expect((await get(potato, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).status).toBe(404);
  });
});
