import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import { ApiUsage, LIMITS, countUsage, reserveUsage, usageToday } from '../services/usage.js';
import { WeatherCache, getWeather } from '../services/openMeteo.js';

// The counters of calls to the free services and the operator health page that shows them next to their limits.
const NOW = new Date('2026-10-27T10:20:00Z');
const H = 'x-alerts-token';
const meteo = { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time: ['2026-10-27T00:00'], temperature_2m: [20], relative_humidity_2m: [50], precipitation: [0] } };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ApiUsage.init();
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
afterEach(async () => { nock.cleanAll(); delete process.env.WEATHER_CACHE_HOURS; await Promise.all([ApiUsage, WeatherCache].map((m) => m.deleteMany({}))); });
afterAll(async () => { nock.enableNetConnect(); await mongoose.disconnect(); await mongod.stop(); });

describe('the counters', () => {
  test('a call adds to its service for the UTC day; a new day starts again from zero', async () => {
    await countUsage('open-meteo', 1, NOW);
    await countUsage('open-meteo', 2, NOW);
    await countUsage('firms', 3, NOW);
    await countUsage('open-meteo', 1, new Date('2026-10-28T00:05:00Z'));
    const u = await usageToday(NOW);
    expect(u.day).toBe('2026-10-27');
    expect(u.services.find((s) => s.service === 'open-meteo')).toMatchObject({ calls: 3, perDay: 10000, pct: 0 });
    expect(u.services.find((s) => s.service === 'firms')).toMatchObject({ calls: 3, perDay: null, pct: null });
    expect((await usageToday(new Date('2026-10-28T12:00:00Z'))).services.find((s) => s.service === 'open-meteo').calls).toBe(1);
  });

  test('the two Open-Meteo services share one allowance, and the percentage rounds', async () => {
    await countUsage('open-meteo', 6000, NOW);
    await countUsage('open-meteo-flood', 1234, NOW);
    const u = await usageToday(NOW);
    expect(u.openMeteoCalls).toBe(7234);
    expect(u.openMeteoPct).toBe(72);
  });

  test('no calls yet: every service is listed with zero', async () => {
    const u = await usageToday(NOW);
    expect(u.services.map((s) => s.service)).toEqual(Object.keys(LIMITS));
    expect(u.services.every((s) => s.calls === 0)).toBe(true);
  });

  test('a database failure never fails the caller', async () => {
    await mongoose.disconnect();
    await expect(countUsage('firms', 1, NOW)).resolves.toBeUndefined();
    await mongoose.connect(mongod.getUri());
  }, 30000);
});

describe('what is counted', () => {
  test('a forecast call counts once, and the second look inside the hour (the cache) counts nothing', async () => {
    process.env.OPEN_METEO_URL = 'http://meteo.test/v1/forecast';
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, meteo);
    await getWeather(30.9, 75.85, NOW);
    await getWeather(30.9, 75.85, NOW);
    expect((await usageToday()).services.find((s) => s.service === 'open-meteo').calls).toBe(1);
  });

  test('WEATHER_CACHE_HOURS=3 serves the same cell for three hours: a forecast at 10:20 is reused at 11:50 but not at 12:05', async () => {
    process.env.WEATHER_CACHE_HOURS = '3';
    nock('http://meteo.test').get('/v1/forecast').query(true).times(2).reply(200, meteo);
    await getWeather(30.9, 75.85, new Date('2026-10-27T09:20:00Z'));          // window 09-11
    await getWeather(30.9, 75.85, new Date('2026-10-27T10:50:00Z'));          // same window: cached
    expect(nock.pendingMocks()).toHaveLength(1);
    await getWeather(30.9, 75.85, new Date('2026-10-27T12:05:00Z'));          // next window: asked again
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  test('the default stays one hour: 10:20 and 11:20 are two calls', async () => {
    nock('http://meteo.test').get('/v1/forecast').query(true).times(2).reply(200, meteo);
    await getWeather(30.9, 75.85, new Date('2026-10-27T10:20:00Z'));
    await getWeather(30.9, 75.85, new Date('2026-10-27T11:20:00Z'));
    expect(nock.pendingMocks()).toHaveLength(0);
  });
});

describe('GET /api/alerts/health', () => {
  test('adds the switches, what is configured and today\'s usage, and still needs the token', async () => {
    expect((await request(app).get('/api/alerts/health')).status).toBe(401);
    await countUsage('open-meteo', 5);
    const res = await request(app).get('/api/alerts/health').set(H, 'test-alerts-token');
    expect(res.status).toBe(200);
    expect(res.body.switches).toEqual({ sachet: 'off', imd: 'off', cwc: 'off', glofas: 'off', radar: 'on', news: 'off', fire: 'on', community: 'on', mandi: 'on' });
    expect(res.body.configured).toEqual({ firmsKey: false, geoService: false, push: false });
    expect(res.body.usage.services.find((s) => s.service === 'open-meteo').calls).toBe(5);
    expect(res.body.sources.map((s) => s.source)).toEqual(['sachet', 'imd', 'cwc', 'news']);
    expect(JSON.stringify(res.body)).not.toMatch(/test-alerts-token|FIRMS_MAP_KEY=/);
  });
});

describe('reserving a call before it is made', () => {
  test('30 requests arriving together for a budget of 50% of the day take exactly what fits: 10 of 462', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => reserveUsage('open-meteo-flood', 462, 50, NOW)));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect((await usageToday(NOW)).services.find((s) => s.service === 'open-meteo-flood').calls).toBe(4620);   // the refused ones gave their count back
  });

  test('the forecast calls already made count against the same allowance', async () => {
    await countUsage('open-meteo', 4800, NOW);
    expect(await reserveUsage('open-meteo-flood', 462, 50, NOW)).toBe(false);
    expect(await reserveUsage('open-meteo-flood', 200, 50, NOW)).toBe(true);        // 4,800 + 200 is exactly 50%
    expect(await reserveUsage('open-meteo-flood', 1, 50, NOW)).toBe(false);
  });

  test('a refusal leaves the count where it was, a new day starts again, and with no database the answer is no', async () => {
    await countUsage('open-meteo-flood', 4900, NOW);
    expect(await reserveUsage('open-meteo-flood', 462, 50, NOW)).toBe(false);
    expect((await usageToday(NOW)).openMeteoCalls).toBe(4900);
    expect(await reserveUsage('open-meteo-flood', 462, 50, new Date('2026-10-28T01:00:00Z'))).toBe(true);
    await mongoose.disconnect();
    expect(await reserveUsage('open-meteo-flood', 1, 50, NOW)).toBe(false);
    await mongoose.connect(mongod.getUri());
  }, 30000);
});
