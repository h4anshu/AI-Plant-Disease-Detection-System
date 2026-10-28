import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import { COMMODITY, MandiCache, parseRecords, resetMandiFailures, rowsFor, statesOf, summarize } from '../services/mandi.js';
import logger from '../utils/logger.js';

// Real answers of data.gov.in's "Variety-wise Daily Market Prices Data of Commodity" (tests/fixtures/mandi, captured 28 Oct 2026): the newest 600
// rows of Punjab wheat (last reported 6 Oct 2026, 111 markets) and of Odisha paddy (last reported 4 Nov 2025: a year old). Cases the day did not
// hold (a trend, varieties, text prices) are written by hand and say so.
const fx = (p) => JSON.parse(readFileSync(new URL(`./fixtures/mandi/${p}`, import.meta.url), 'utf8'));
const WHEAT = fx('punjab_wheat.json');
const PADDY = fx('odisha_paddy.json');
const DATA = 'https://api.data.gov.in';
const PATH = '/resource/35985678-0d79-46b4-9ed6-6f13308a1d24';
const KEY = 'test-data-gov-key-0123456789abcdefghijklmnopqrstuvwxyz';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const NOW = new Date('2026-10-08T06:00:00Z');
const rec = (d, market, p, district = 'Ludhiana', variety = 'Other') => ({ Arrival_Date: d, Market: market, District: district, Modal_Price: p, Variety: variety, State: 'Punjab', Commodity: 'Wheat' });

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
  delete process.env.DATA_GOV_API_KEY;
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
  resetMandiFailures();
  await Promise.all([MandiCache, Field].map((m) => m.deleteMany({})));
});
afterAll(async () => { nock.enableNetConnect(); await mongoose.disconnect(); await mongod.stop(); });

describe('reading the records', () => {
  test('the real answer: dates, markets, prices; text prices become numbers; broken rows are dropped', () => {
    const rows = parseRecords(WHEAT);
    expect(rows).toHaveLength(600);
    expect(rows[0]).toMatchObject({ d: '2026-10-06', p: expect.any(Number) });
    expect(parseRecords({ records: [rec('27/07/2007', 'Agar', '980'), rec('bad', 'X', 1), rec('01/01/2026', '', 1), rec('01/01/2026', 'Y', 0), rec('27/10/2026', 'Patti APMC', 0.01), rec('01/01/2026', 'Z', 'n.a.'), rec('31/02/2026', 'W', 5)] }))
      .toEqual([{ d: '2007-07-27', m: 'Agar', k: 'Ludhiana', p: 980 }]);
  });

  test('an error page, an empty body or a missing list is not "no prices"', () => {
    expect(() => parseRecords('<html>500</html>')).toThrow('not a mandi table');
    expect(() => parseRecords({ message: 'Slim Application Error' })).toThrow();
    expect(parseRecords({ records: [] })).toEqual([]);
  });
});

describe('summarize', () => {
  const rows = parseRecords(WHEAT);

  test('Punjab wheat 2 days after the last report: the day\'s median, lowest and highest over the markets, worked out here from the raw rows', () => {
    const last = '06/10/2026';
    const raw = WHEAT.records.filter((r) => r.Arrival_Date === last);
    const byMarket = new Map();
    for (const r of raw) (byMarket.get(r.Market) ?? byMarket.set(r.Market, []).get(r.Market)).push(Number(r.Modal_Price));
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const prices = [...byMarket.values()].map((a) => Math.round(med(a)));
    const s = summarize(rows, [], NOW);
    expect(s).toMatchObject({ status: 'ok', date: '2026-10-06', ageDays: 2, markets: byMarket.size, median: Math.round(med(prices)), min: Math.min(...prices), max: Math.max(...prices) });
    expect(s.markets).toBe(1);                                // the real last day of Punjab wheat (off season) was reported by ONE market: the card must say so
    expect(s.local).toEqual([]);
  });

  test('the field\'s own district: up to 3 markets of it, in any spelling of its name', () => {
    const dist = WHEAT.records.find((r) => r.Arrival_Date === '06/10/2026').District;
    const s = summarize(rows, [dist.toUpperCase()], NOW);
    expect(s.local.length).toBeGreaterThanOrEqual(1);
    expect(s.local.length).toBeLessThanOrEqual(3);
    expect(s.local.every((l) => l.district === dist && l.price > 0)).toBe(true);
    expect(summarize(rows, ['Nowhere'], NOW).local).toEqual([]);
  });

  test('a last price older than 14 days is "stale", with its date: Punjab wheat 3 weeks on, and Odisha paddy a year on', () => {
    expect(summarize(rows, [], new Date('2026-10-27T06:00:00Z'))).toEqual({ status: 'stale', lastDate: '2026-10-06', ageDays: 21 });
    expect(summarize(parseRecords(PADDY), [], new Date('2026-10-27T06:00:00Z'))).toMatchObject({ status: 'stale', lastDate: '2025-11-04' });
    expect(summarize(rows, [], new Date('2026-10-20T06:00:00Z')).status).toBe('ok');      // exactly 14 days is still recent
  });

  test('no rows at all is "none"', () => {
    expect(summarize([], [], NOW)).toEqual({ status: 'none' });
  });

  test('several varieties in one market on one day count as one price (their median)', () => {
    const s = summarize(parseRecords({ records: [rec('06/10/2026', 'A', 2000, 'X', 'v1'), rec('06/10/2026', 'A', 3000, 'X', 'v2'), rec('06/10/2026', 'A', 9000, 'X', 'v3'), rec('06/10/2026', 'B', 2100)] }), [], NOW);
    expect(s).toMatchObject({ markets: 2, median: 2550, min: 2100, max: 3000 });
  });

  // by hand: the markets a, b, c, d on 1 Oct and 6 Oct
  const week = (today, before) => parseRecords({ records: [...today.map(([m, p]) => rec('06/10/2026', m, p)), ...before.map(([m, p]) => rec('01/10/2026', m, p))] });

  test('the trend compares only markets that reported on both days: +10% in two, +20% in the third gives +10%', () => {
    const s = summarize(week([['a', 2200], ['b', 2420], ['c', 3600], ['d', 5000]], [['a', 2000], ['b', 2200], ['c', 3000], ['e', 100]]), [], NOW);
    expect(s.trend).toEqual({ pct: 10, since: '2026-10-01', markets: 3 });
    expect(s.markets).toBe(4);                                // d is in today's median but not in the trend
  });

  test('fewer than 3 common markets, or an earlier day less than 3 days back, is no trend', () => {
    expect(summarize(week([['a', 2200], ['b', 2420]], [['a', 2000], ['b', 2200]]), [], NOW).trend).toBeNull();
    const near = parseRecords({ records: [rec('06/10/2026', 'a', 100), rec('06/10/2026', 'b', 100), rec('06/10/2026', 'c', 100), rec('05/10/2026', 'a', 100), rec('05/10/2026', 'b', 100), rec('05/10/2026', 'c', 100)] });
    expect(summarize(near, [], NOW).trend).toBeNull();
  });

  test('a falling price is a negative trend, rounded to one decimal', () => {
    const s = summarize(week([['a', 1900], ['b', 1900], ['c', 1900]], [['a', 2000], ['b', 2000], ['c', 2000]]), [], NOW);
    expect(s.trend.pct).toBe(-5);
  });
});

describe('asking data.gov.in', () => {
  const ask = (reply = WHEAT, status = 200, seen = []) => nock(DATA).get(PATH).query((q) => { seen.push(q); return true; }).reply(status, reply);

  test('the state and commodity are filters, the newest first, with the key; names for the ten crops are the dataset\'s own', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    const seen = [];
    ask(WHEAT, 200, seen);
    const rows = await rowsFor('Punjab', COMMODITY.wheat, NOW);
    expect(rows).toHaveLength(600);
    expect(seen[0]).toMatchObject({ 'api-key': KEY, format: 'json', limit: '400', 'filters[State]': 'Punjab', 'filters[Commodity]': 'Wheat', 'sort[Arrival_Date]': 'desc' });
    expect(Object.keys(COMMODITY).sort()).toEqual(['apple', 'banana', 'blackgram', 'groundnut', 'maize', 'pigeonpea', 'rice', 'sugarcane', 'potato', 'wheat'].sort());
    expect(COMMODITY.rice).toBe('Paddy(Dhan)(Common)');
  });

  test('one answer serves everyone for 6 hours (no mock is left for the second call)', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    ask();
    await rowsFor('Punjab', 'Wheat', NOW);
    await rowsFor('Punjab', 'Wheat', new Date(NOW.getTime() + 3600e3));
    expect(await MandiCache.countDocuments()).toBe(1);
  });

  test('a state that the dataset spells in two ways is asked for under both and merged; the others under their own spelling', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    expect(statesOf('Uttarakhand')).toEqual(['Uttarakhand', 'Uttrakhand']);
    expect(statesOf('Delhi')).toEqual(['NCT of Delhi']);
    expect(statesOf('Chhattisgarh')).toEqual(['Chattisgarh']);
    expect(statesOf('Puducherry')).toEqual(['Pondicherry']);
    expect(statesOf('Punjab')).toEqual(['Punjab']);
    const seen = [];
    ask({ records: [rec('06/10/2026', 'A', 1000)] }, 200, seen);
    ask({ records: [rec('05/10/2026', 'B', 2000)] }, 200, seen);
    const rows = await rowsFor('Uttarakhand', 'Wheat', NOW);
    expect(seen.map((q) => q['filters[State]']).sort()).toEqual(['Uttarakhand', 'Uttrakhand']);
    expect(rows.map((r) => r.m).sort()).toEqual(['A', 'B']);
  });

  test('429, 500 and a 200 that is not a table are errors; the same question is not repeated for 10 minutes', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    ask('stream has been aborted', 429);
    await expect(rowsFor('Punjab', 'Wheat', NOW)).rejects.toBeTruthy();
    await expect(rowsFor('Punjab', 'Wheat', new Date(NOW.getTime() + 5 * 60e3))).rejects.toThrow('failed recently');   // no mock: nothing was asked
    ask({ message: 'Slim Application Error' });
    await expect(rowsFor('Punjab', 'Wheat', new Date(NOW.getTime() + 11 * 60e3))).rejects.toThrow('not a mandi table');
    expect(await MandiCache.countDocuments()).toBe(0);
  });
});

describe('GET /api/fields/:id/prices', () => {
  const save = (device = DEVICE, o = {}) => request(app).post('/api/fields').set('x-device-id', device).send({ crop: 'wheat', stage: 'flowering', lat: 30.9012, lon: 75.8573, ...o });
  const prices = (id, device = DEVICE) => request(app).get(`/api/fields/${id}/prices`).set('x-device-id', device);
  const district = (id) => Field.updateOne({ _id: id }, { $set: { district: { lgd: [{ code: 36, name: 'Ludhiana' }], imd: [{ id: 1, name: 'LUDHIANA' }], at: new Date() } } });
  const recent = (days = 1) => {
    const t = new Date(Date.now() - days * 864e5);
    const d = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`;
    return { records: [rec(d, 'Khanna APMC', 2400, 'Ludhiana'), rec(d, 'Jagraon APMC', 2440, 'Ludhiana'), rec(d, 'Moga APMC', 2380, 'Moga'), rec(d, 'Abohar APMC', 2300, 'Fazilka')] };
  };

  test('the card\'s numbers, the field\'s district markets, and nothing about the place', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    const id = (await save()).body._id;
    await district(id);
    nock(DATA).get(PATH).query(true).reply(200, recent());
    const res = await prices(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', state: 'Punjab', crop: 'wheat', unit: 'quintal', ageDays: 1, markets: 4, median: 2390, min: 2300, max: 2440, trend: null });
    expect(res.body.local).toEqual([{ market: 'Jagraon APMC', district: 'Ludhiana', price: 2440 }, { market: 'Khanna APMC', district: 'Ludhiana', price: 2400 }]);
    expect(JSON.stringify(res.body)).not.toMatch(/30\.9|75\.8|test-data-gov-key/);
  });

  test('stale, none and no state are said, not shown as a price', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    const id = (await save()).body._id;
    expect((await prices(id)).body).toEqual({ status: 'no_state', crop: 'wheat' });         // no district known yet (IMD is off here)
    await district(id);
    nock(DATA).get(PATH).query(true).reply(200, recent(30));
    expect((await prices(id)).body).toMatchObject({ status: 'stale', ageDays: 30, state: 'Punjab' });
    await MandiCache.deleteMany({});
    nock(DATA).get(PATH).query(true).reply(200, { records: [] });
    expect((await prices(id)).body).toMatchObject({ status: 'none', state: 'Punjab', crop: 'wheat' });
  });

  test('data.gov.in down: "unavailable" with a 200, a log line without the key, and the card of other fields unaffected', async () => {
    process.env.DATA_GOV_API_KEY = KEY;
    const warn = jest.spyOn(logger, 'warn');
    const id = (await save()).body._id;
    await district(id);
    nock(DATA).get(PATH).query(true).reply(500, { message: 'Slim Application Error' });
    const res = await prices(id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'unavailable', state: 'Punjab', crop: 'wheat' });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }), 'Mandi prices failed');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/test-data-gov-key|30\.9|75\.8/);
  });

  test('without the key, or with the switch "mandi" off, it is disabled and nothing is asked', async () => {
    const id = (await save()).body._id;
    expect((await prices(id)).body).toEqual({ status: 'disabled', crop: 'wheat' });
    process.env.DATA_GOV_API_KEY = KEY;
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news,mandi';
    expect((await prices(id)).body.status).toBe('disabled');
  });

  test('another browser\'s field, a bad id or no device id is a plain 404', async () => {
    const id = (await save()).body._id;
    expect((await prices(id, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).status).toBe(404);
    expect((await prices('nope')).status).toBe(404);
    expect((await request(app).get(`/api/fields/${id}/prices`)).status).toBe(404);
  });
});
