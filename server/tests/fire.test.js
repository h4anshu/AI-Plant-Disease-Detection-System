import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import { FireCache, fireFor, parseFires, resetFireFailures } from '../services/fire.js';
import { WeatherCache } from '../services/openMeteo.js';
import logger from '../utils/logger.js';

// Real answers of NASA FIRMS (tests/fixtures/fire, captured 27 Oct 2026 for a 22 km box near Ludhiana, in the stubble-burning season):
// 3 VIIRS Suomi-NPP detections of 26 Oct (07:26, 07:26 and 09:07 UTC), none from NOAA-20 / NOAA-21 in that box, an empty answer, and what
// FIRMS says for a wrong key (HTTP 400, plain text). The two fires at 07:26 are about 0.1 km apart; the third is 7.6 km from them.
const fx = (p) => readFileSync(new URL(`./fixtures/fire/${p}`, import.meta.url), 'utf8');
const SNPP = fx('viirs_snpp.csv');
const HEAD = SNPP.split('\n')[0];
const NOW = new Date('2026-10-26T12:00:00Z');
const FIRMS = 'https://firms.modaps.eosdis.nasa.gov';
const KEY = 'test-firms-key-0123456789abcdef';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const at = (lat, lon, crop = 'wheat') => ({ crop, stage: 'grain_fill', location: { coordinates: [lon, lat] } });
// about 0.3 km, 2.4 km and 3.3 km from the two fires at 07:26; FAR is more than 5 km from all three
const NEAR = at(30.993, 76.064);
const MID = at(30.99, 76.09);
const EDGE = at(30.99, 76.1);
const FAR = at(30.99, 76.124);   // the same 0.05° cell as MID and EDGE, but 5.6 km from the nearest fire
const OTHER = at(30.95, 76.14);  // a cell of its own

const path = (src) => new RegExp(`/api/area/csv/${KEY}/${src}/[-0-9.,]+/2$`);
const mockSource = (src, body = HEAD, status = 200) => nock(FIRMS).get(path(src)).reply(status, body);
const mockAll = (snpp = SNPP, other = HEAD) => { mockSource('VIIRS_SNPP_NRT', snpp); mockSource('VIIRS_NOAA20_NRT', other); mockSource('VIIRS_NOAA21_NRT', other); };
// the fixture's rows moved to `hours` hours before now (the route tests use the real clock)
const rowsAgo = (hours, now = new Date()) => {
  const t = new Date(now.getTime() - hours * 3600e3);
  const date = t.toISOString().slice(0, 10);
  const time = String(t.getUTCHours() * 100 + t.getUTCMinutes());
  return `${HEAD}\n${SNPP.trim().split('\n').slice(1).map((r) => r.split(',').map((c, i) => (i === 5 ? date : i === 6 ? time : c)).join(',')).join('\n')}`;
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
  delete process.env.FIRMS_MAP_KEY;
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
  resetFireFailures();
  await Promise.all([FireCache, Field, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

describe('reading FIRMS', () => {
  test('the real table: position, time (HHMM without a leading zero is still a time) and no coordinates lost', () => {
    const f = parseFires(SNPP);
    expect(f).toHaveLength(3);
    expect(f[0]).toMatchObject({ lat: 30.99242, lon: 76.06074, conf: 'n' });
    expect(f[0].at.toISOString()).toBe('2026-10-26T07:26:00.000Z');   // 726
    expect(f[2].at.toISOString()).toBe('2026-10-26T09:07:00.000Z');   // 907
  });

  test('a header only is a valid answer with no fires; low-confidence detections are dropped', () => {
    expect(parseFires(fx('empty.csv'))).toEqual([]);
    const low = `${HEAD}\n30.9,76.0,330,0.4,0.6,2026-10-26,726,N,VIIRS,l,2.0NRT,298,3.8,D\n30.9,76.0,330,0.4,0.6,2026-10-26,726,N,VIIRS,h,2.0NRT,298,3.8,D`;
    expect(parseFires(low)).toHaveLength(1);
  });

  test('a wrong key, a quota message or an error page is not "no fires"', () => {
    expect(() => parseFires(fx('badkey.txt'))).toThrow('not a FIRMS table');
    expect(() => parseFires('<html>Service unavailable</html>')).toThrow();
    expect(() => parseFires('')).toThrow();
  });
});

describe('fireFor', () => {
  const run = (f, now = NOW) => { process.env.FIRMS_MAP_KEY = KEY; return fireFor(f, now); };

  test('a fire within 1 km is a warning; the alert has a count, a band and the newest time, and no coordinates', async () => {
    mockAll();
    const a = await run(NEAR);
    expect(a).toMatchObject({ rule: 'FIRE-NEAR-1', hazard: 'fire_near', level: 'warn', offset: 0, confidence: 'medium', reviewStatus: 'draft', crop: 'wheat', stage: 'grain_fill',
      values: { metric: 'fire', count: 2, nearKm: 1, newest: '2026-10-26T07:26:00.000Z', window: 24, radiusKm: 5 } });
    expect(a.id).toBe('FIRE-NEAR-1|2026-10-26');
    expect(JSON.stringify(a)).not.toMatch(/30\.99|76\.06|76\.0|31\.00/);
  });

  test('2.4 km is a watch, 3.3 km a tip, and a field with nothing within 5 km has no alert (the third fire is far away)', async () => {
    mockAll();
    expect(await run(MID)).toMatchObject({ level: 'watch', values: { nearKm: 3, count: 2 } });
    expect(await run(EDGE)).toMatchObject({ level: 'info', values: { nearKm: 5, count: 2 } });
    expect(await run(FAR)).toBeNull();     // all three answers come from the cache above: one request set served four fields
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('only the last 24 hours count, and a time in the future is not believed', async () => {
    mockAll();
    expect(await run(NEAR, new Date('2026-10-27T08:00:00Z'))).toBeNull();     // 24.6 h after the first fires, 22.9 h after the third: only the third is left, 7.6 km away
    expect(await run(NEAR, new Date('2026-10-26T07:00:00Z'))).toBeNull();     // before the detections (26 minutes and more): they cannot be in the future
  });

  test('one fire seen by two satellites in the same hour counts once', async () => {
    mockAll(SNPP, SNPP);
    expect(await run(NEAR)).toMatchObject({ values: { count: 2 } });
  });

  test('a cell is asked for once, then served from the cache (no mock is left for the second call)', async () => {
    mockAll();
    await run(NEAR);
    expect(await run(NEAR)).toMatchObject({ level: 'warn' });
    expect(await FireCache.countDocuments()).toBe(1);
  });

  test('a failing answer throws (so the screen says "unavailable"), and is not asked again for 10 minutes', async () => {
    mockSource('VIIRS_SNPP_NRT', 'Invalid MAP_KEY.', 400);
    mockSource('VIIRS_NOAA20_NRT'); mockSource('VIIRS_NOAA21_NRT');
    await expect(run(OTHER)).rejects.toThrow();
    await expect(run(OTHER)).rejects.toThrow('failed recently');   // no mock left: it did not ask
    nock.cleanAll();
  });

  test('a 200 with a plain-text error is also a failure, never "no fires"', async () => {
    mockAll('Exceeded quota. Wait 10 minutes.');
    await expect(run(OTHER)).rejects.toThrow('not a FIRMS table');
  });
});

describe('GET /api/fields/alerts with fire', () => {
  const save = (o = {}) => request(app).post('/api/fields').set('x-device-id', DEVICE).send({ crop: 'wheat', stage: 'grain_fill', lat: 30.993, lon: 76.064, ...o });
  const alerts = () => request(app).get('/api/fields/alerts').set('x-device-id', DEVICE);
  const pad = (n) => String(n).padStart(2, '0');
  const meteo = () => {
    const d0 = new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
    const add = (n) => { const d = new Date(`${d0}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const time = [];
    for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${add(i)}T${pad(h)}:00`);
    return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: time.map(() => 20), relative_humidity_2m: time.map(() => 60), precipitation: time.map((t) => (t.slice(11, 13) === '03' ? 3 : 0)) } };
  };
  const weather = () => nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, meteo());

  test('the alert and its status are in the answer; no coordinates, no key', async () => {
    process.env.FIRMS_MAP_KEY = KEY;
    mockAll(rowsAgo(3));
    weather();
    await save();
    const res = await alerts();
    expect(res.status).toBe(200);
    const [f] = res.body.fields;
    expect(f.fire).toEqual({ status: 'ok' });
    expect(f.alerts.map((a) => a.rule)).toEqual(['FIRE-NEAR-1']);
    expect(f.alerts[0]).toMatchObject({ level: 'warn', values: { nearKm: 1, count: 2 } });
    expect(JSON.stringify(res.body)).not.toMatch(/30\.99|76\.06|test-firms-key/);
  });

  test('nothing near: status ok and no alert; this is the only case that reads as "no fire"', async () => {
    process.env.FIRMS_MAP_KEY = KEY;
    mockAll(HEAD);
    weather();
    await save({ lat: 24.1, lon: 72.1 });
    const [f] = (await alerts()).body.fields;
    expect(f.fire).toEqual({ status: 'ok' });
    expect(f.alerts).toEqual([]);
  });

  test('FIRMS down: "unavailable", no alert, the rest of the answer stays, and the key is in no log line', async () => {
    process.env.FIRMS_MAP_KEY = KEY;
    const warn = jest.spyOn(logger, 'warn');
    mockSource('VIIRS_SNPP_NRT', 'x', 503); mockSource('VIIRS_NOAA20_NRT', 'x', 503); mockSource('VIIRS_NOAA21_NRT', 'x', 503);
    weather();
    await save();
    const res = await alerts();
    expect(res.body.fields[0]).toMatchObject({ status: 'ok', fire: { status: 'unavailable' }, alerts: [] });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), 'Fire check failed');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/test-firms-key|30\.99|76\.06/);
  });

  test('without a key, or with the switch "fire" off, the check is disabled and nothing is asked', async () => {
    weather();
    await save();
    expect((await alerts()).body.fields[0].fire).toEqual({ status: 'disabled' });
    process.env.FIRMS_MAP_KEY = KEY;
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news,fire';
    weather();
    expect((await alerts()).body.fields[0].fire).toEqual({ status: 'disabled' });
  });
});
