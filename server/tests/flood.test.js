import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import { CwcStation, FloodClimate, FloodForecast } from '../models/Flood.js';
import { SourceHealth } from '../models/OfficialAlert.js';
import { WeatherCache } from '../services/openMeteo.js';
import { cellPoints, resetFloodFailures, riverSignal } from '../services/flood.js';
import { gaugeFor, ingestCwc, parseStations, parseStatus } from '../services/alerts/cwc.js';
import { refresh } from '../services/alerts/ingest.js';
import { ApiUsage, countUsage } from '../services/usage.js';

// Real answers captured from Open-Meteo's flood API and the CWC site on 25 Oct 2026 (tests/fixtures/flood): the 5 points around the
// Ludhiana and Cuttack cells (the climatology thinned to every 7th day), CWC's station list (119 of its 1,741 stations) and its list of
// stations above warning. Cases the day did not contain (a rising river, a danger gauge) change the numbers of a real answer and say so.
const fx = (p) => JSON.parse(readFileSync(new URL(`./fixtures/flood/${p}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-10-25T05:30:00Z'); // 11:00 in India
const LUDHIANA = { crop: 'wheat', stage: 'flowering', location: { coordinates: [75.8573, 30.9012] } };
const CUTTACK = { crop: 'rice', stage: 'flowering', location: { coordinates: [85.883, 20.4625] } };
const FLOOD = 'http://flood.test';
const CWC = 'http://cwc.test';

const mockForecast = (data, seen = []) => nock(FLOOD).get('/v1/flood').query((q) => { if (q.start_date) return false; seen.push(q); return true; }).reply(200, data);
const mockClimate = (data, seen = []) => nock(FLOOD).get('/v1/flood').query((q) => { if (q.start_date !== '2005-01-01') return false; seen.push(q); return true; }).reply(200, data);
const mockSignal = (name, forecast = fx(`forecast_${name}.json`)) => { mockForecast(forecast); mockClimate(fx(`climate_${name}.json`)); };
// a real forecast with the north point's (the Sutlej) discharge replaced by `values`, from today on
const sutlej = (values) => { const f = fx('forecast_ludhiana.json'); const days = f[1].daily.time.length; f[1].daily.river_discharge = Array.from({ length: days }, (_, i) => values[Math.max(0, i - 1)] ?? values.at(-1)); return f; };

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await CwcStation.init(); // the 2dsphere index must exist before $near
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
beforeEach(() => { process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd'; });
afterEach(async () => {
  nock.cleanAll();
  jest.restoreAllMocks();
  resetFloodFailures();
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas';
  await Promise.all([Field, FloodForecast, FloodClimate, CwcStation, SourceHealth, WeatherCache, ApiUsage].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

describe('the river signal', () => {
  test('a cell is asked with its four neighbours 0.1° away, never with the field\'s own point', async () => {
    expect(cellPoints(30.9012, 75.8573)).toEqual([{ lat: 30.9, lon: 75.85 }, { lat: 31, lon: 75.85 }, { lat: 30.8, lon: 75.85 }, { lat: 30.9, lon: 75.95 }, { lat: 30.9, lon: 75.75 }]);
    const seen = [];
    const clim = [];
    mockForecast(fx('forecast_ludhiana.json'), seen); mockClimate(fx('climate_ludhiana.json'), clim);
    await riverSignal(LUDHIANA, NOW);
    expect(seen[0]).toMatchObject({ latitude: '30.9,31,30.8,30.9,30.9', longitude: '75.85,75.85,75.85,75.95,75.75', daily: 'river_discharge', forecast_days: '7' });
    // the usual range is asked for the one river point only (a request is weighed by its points and days), 2005 to July 2022
    expect(clim).toHaveLength(1);
    expect(clim[0]).toMatchObject({ latitude: '31', longitude: '75.85', start_date: '2005-01-01', end_date: '2022-07-31' });
    expect(JSON.stringify([seen, clim])).not.toMatch(/30\.9012|75\.8573/);
  });

  test('Ludhiana: the cell itself is a 2 m³/s drain, the Sutlej is one step north and is the river used (the plan\'s wrong-river case)', async () => {
    mockSignal('ludhiana');
    const s = await riverSignal(LUDHIANA, NOW);
    expect(s).toMatchObject({ status: 'ok', now: 201, level: null });
    expect(s.peak).toBeGreaterThan(190);        // the drain peaks near 2
    expect(s.p95).toBeGreaterThan(200);          // the Sutlej's own usual flows
    expect(s.alert).toBeUndefined();             // 201 is within its usual range: no alert
  });

  test('a river that is rising beyond its 95th percentile is a watch, beyond its 99th a warning, with the series and the draft mark', async () => {
    mockSignal('ludhiana');
    const base = await riverSignal(LUDHIANA, NOW);
    const later = new Date(NOW.getTime() + 7 * 3600e3); // a new 6-hour forecast window; the climatology stays cached
    mockForecast(sutlej([200, 205, 210, base.p95 + 5, base.p95 + 6, 205, 200]));
    const watch = await riverSignal(LUDHIANA, later);
    expect(watch).toMatchObject({ status: 'ok', level: 'watch', rising: true });
    expect(watch.alert).toMatchObject({ id: 'FLOOD-RIVER-1|2026-10-29', rule: 'FLOOD-RIVER-1', hazard: 'flood_river', level: 'watch', date: '2026-10-29', offset: 4, from: '2026-10-29T00:00', to: '2026-10-30T00:00',
      confidence: 'low', reviewStatus: 'draft', crop: 'wheat', stage: 'flowering' });
    expect(watch.alert.values).toMatchObject({ metric: 'discharge', threshold: base.p95, levels: { watch: base.p95, warn: base.p99 } });
    expect(watch.alert.values.series).toHaveLength(7);
    mockForecast(sutlej([200, 210, base.p99 * 1.2, base.p99 * 1.3, 250, 220, 210]), []);
    const warn = await riverSignal(LUDHIANA, new Date(NOW.getTime() + 14 * 3600e3));
    expect(warn.alert).toMatchObject({ level: 'warn', date: '2026-10-28', offset: 2 }); // 14 hours on it is already the 26th in India
  });

  test('a long lead is never a warning; a high river that is already falling is no alert; a peak today is no alert', async () => {
    mockSignal('ludhiana');
    const { p99 } = await riverSignal(LUDHIANA, NOW);
    mockForecast(sutlej([200, 200, 200, 200, 200, p99 * 2, 210]));   // the peak is 5 days out
    expect((await riverSignal(LUDHIANA, new Date(NOW.getTime() + 7 * 3600e3))).alert).toMatchObject({ level: 'watch', offset: 5 });
    mockForecast(sutlej([p99 * 2, p99 * 1.5, p99, 200, 200, 200, 200]));
    expect((await riverSignal(LUDHIANA, new Date(NOW.getTime() + 14 * 3600e3)))).toMatchObject({ level: null, rising: false });
    mockForecast(sutlej([p99 * 2, p99 * 2, 200, 200, 200, 200, 200]));
    expect((await riverSignal(LUDHIANA, new Date(NOW.getTime() + 21 * 3600e3)))).toMatchObject({ level: null });
  });

  test('where only drains are in reach it says there is no river signal here, whatever they do', async () => {
    const f = fx('forecast_ludhiana.json');
    mockForecast(f.map(() => f[0]));   // all five points are the cell's own 2 m³/s channel; no usual range is asked for
    expect(await riverSignal(LUDHIANA, NOW)).toEqual({ status: 'none' });
    expect(nock.isDone()).toBe(true);
  });

  test('a point without enough history for a usual range is not judged', async () => {
    const c = fx('climate_ludhiana.json');
    c.daily = { time: c.daily.time.slice(0, 20), river_discharge: c.daily.river_discharge.slice(0, 20) };
    mockForecast(fx('forecast_ludhiana.json')); mockClimate(c);
    expect(await riverSignal(LUDHIANA, NOW)).toEqual({ status: 'none' });
  });

  test('Cuttack: the cell is on the Mahanadi itself; its flows now are within the usual range', async () => {
    mockSignal('cuttack');
    const s = await riverSignal(CUTTACK, NOW);
    expect(s.status).toBe('ok');
    expect(s.now).toBeGreaterThan(1000);
    expect(s.p95).toBeGreaterThan(s.now);
  });

  test('forecasts are kept 6 hours and the climatology for good: nothing is asked twice', async () => {
    mockSignal('ludhiana');
    await riverSignal(LUDHIANA, NOW);
    await riverSignal(LUDHIANA, new Date(NOW.getTime() + 600e3)); // 10 minutes later, same 6-hour window: no mock left: a request would fail
    expect(await FloodClimate.countDocuments()).toBe(1);
    mockForecast(fx('forecast_ludhiana.json'));
    await riverSignal(LUDHIANA, new Date(NOW.getTime() + 7 * 3600e3)); // forecast again, climatology not
    expect(nock.isDone()).toBe(true);
  });

  test('the history of a new river (about 460 weighted calls) waits once half of the allowance of the day is used: the forecast is still asked, and the next day the history is', async () => {
    await countUsage('open-meteo', 5200, NOW);                 // 52% of 10,000
    mockForecast(fx('forecast_ludhiana.json'));
    await expect(riverSignal(LUDHIANA, NOW)).rejects.toThrow('budget for today is used');
    expect(await FloodForecast.countDocuments()).toBe(1);
    expect(await FloodClimate.countDocuments()).toBe(0);
    await expect(riverSignal(LUDHIANA, new Date(NOW.getTime() + 600e3))).rejects.toThrow('budget for today is used'); // nothing asked: no mock
    const tomorrow = new Date(NOW.getTime() + 24 * 3600e3);
    mockForecast(fx('forecast_ludhiana.json'));
    mockClimate(fx('climate_ludhiana.json'));
    await expect(riverSignal(LUDHIANA, tomorrow)).resolves.toMatchObject({ status: 'ok' });
    expect(await FloodClimate.countDocuments()).toBe(1);
  });

  test('FLOOD_CLIMATE_BUDGET_PCT moves the line', async () => {
    await countUsage('open-meteo', 5200, NOW);
    process.env.FLOOD_CLIMATE_BUDGET_PCT = '80';
    mockSignal('ludhiana');
    await expect(riverSignal(LUDHIANA, NOW)).resolves.toMatchObject({ status: 'ok' });
    delete process.env.FLOOD_CLIMATE_BUDGET_PCT;
  });

  test('from 80% of the allowance of the day on, not even the river forecast is asked for (the weather, which every field needs, goes first), and nothing is requested', async () => {
    await countUsage('open-meteo', 8100, NOW);
    await expect(riverSignal(LUDHIANA, NOW)).rejects.toThrow('river forecast budget for today is used');   // no mock: a request would fail differently
    expect(await FloodForecast.countDocuments()).toBe(0);
    process.env.FLOOD_FORECAST_BUDGET_PCT = '95';
    process.env.FLOOD_CLIMATE_BUDGET_PCT = '95';   // the history has its own, lower line (50%)
    mockSignal('ludhiana');
    await expect(riverSignal(LUDHIANA, NOW)).resolves.toMatchObject({ status: 'ok' });
    delete process.env.FLOOD_FORECAST_BUDGET_PCT;
    delete process.env.FLOOD_CLIMATE_BUDGET_PCT;
  });

  test.each([[500], [429]])('Open-Meteo answering %i is an error, not "no river here", and the same question is not repeated for 10 minutes', async (status) => {
    nock(FLOOD).get('/v1/flood').query(true).reply(status, 'no');
    await expect(riverSignal(LUDHIANA, NOW)).rejects.toBeTruthy();
    expect(await FloodForecast.countDocuments()).toBe(0);
    await expect(riverSignal(LUDHIANA, new Date(NOW.getTime() + 5 * 60e3))).rejects.toThrow('failed recently'); // no request: there is no mock
    mockSignal('ludhiana');
    await expect(riverSignal(LUDHIANA, new Date(NOW.getTime() + 11 * 60e3))).resolves.toMatchObject({ status: 'ok' });
  });

  test('an answer with the wrong number of points is an error', async () => {
    mockForecast(fx('forecast_ludhiana.json').slice(0, 3)); mockClimate(fx('climate_ludhiana.json'));
    await expect(riverSignal(LUDHIANA, NOW)).rejects.toThrow('unexpected flood answer');
  });
});

describe('CWC river gauges', () => {
  const stations = () => fx('cwc_stations.json');
  const status = () => fx('cwc_status.json');
  const mockCwc = (st = status(), geo = stations()) => {
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, st);
    if (geo) nock(CWC).get('/iam/api/layer-station-geo/specification/').query(true).reply(200, geo);
  };
  // the real station near Gopalganj, Bihar (the Gandak at Dumariaghat is listed WARNING, steady); a field about 5 km away
  const BIHAR = { crop: 'rice', stage: 'flowering', location: { coordinates: [84.72, 26.4] } };

  test('both lists are read: stations with a position, and the ones above warning (codes compared in lower case)', () => {
    const s = parseStations(stations());
    expect(s).toHaveLength(119);
    expect(s.find((x) => x.name === 'Dumariaghat')).toMatchObject({ code: '011-mgd4ptn', type: 'Level', lat: expect.closeTo(26.359, 2) });
    expect(parseStations([{ stationCode: 'X', lat: 'nan', lon: 1 }, { stationCode: '', lat: 1, lon: 1 }, { stationCode: 'Y', lat: 95, lon: 1 }])).toEqual([]);
    expect(parseStations({})).toEqual([]);
    const st = parseStatus(status());
    expect(st).toHaveLength(11);
    expect(st[0]).toMatchObject({ status: expect.stringMatching(/WARNING|DANGER/), trend: expect.stringMatching(/falling|steady|rising/) });
    expect(parseStatus([{ stationCode: 'a', status: 'NORMAL' }, { stationCode: 'b', status: 'warning', trend: 'RISING' }])).toEqual([{ code: 'b', status: 'WARNING', trend: 'rising' }]);
  });

  test('a fetch stores the stations once a day and the statuses every time; stations that drop off the list are cleared', async () => {
    mockCwc();
    expect(await ingestCwc({ now: NOW })).toMatchObject({ recordCount: 11 });
    expect(await CwcStation.countDocuments()).toBe(119);
    expect(await CwcStation.countDocuments({ status: { $ne: null } })).toBe(11);
    mockCwc(status().slice(0, 4), null); // 30 minutes later: no station list is requested, 7 stations are no longer above warning
    await ingestCwc({ now: new Date(NOW.getTime() + 30 * 60e3) });
    expect(await CwcStation.countDocuments({ status: { $ne: null } })).toBe(4);
    mockCwc(status(), stations());      // a day later: the stations again
    await ingestCwc({ now: new Date(NOW.getTime() + 25 * 3600e3) });
    expect(nock.isDone()).toBe(true);
  });

  test('a short or broken station list never wipes the gauges; a failing status list is an error', async () => {
    mockCwc();
    await ingestCwc({ now: NOW });
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, status());
    nock(CWC).get('/iam/api/layer-station-geo/specification/').query(true).reply(200, stations().slice(0, 10));
    await expect(ingestCwc({ now: new Date(NOW.getTime() + 25 * 3600e3) })).rejects.toThrow('station list too short');
    expect(await CwcStation.countDocuments()).toBe(119);
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(503);
    await expect(ingestCwc({ now: NOW })).rejects.toBeTruthy();
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, '<html>maintenance</html>');
    await expect(ingestCwc({ now: NOW })).rejects.toThrow('not a status list'); // an error page is not "nothing is above warning"
    await CwcStation.updateOne({ code: '011-mgd4ptn' }, { $set: { status: 'WARNING' } });
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, '<html>maintenance</html>');
    await expect(ingestCwc({ now: NOW })).rejects.toBeTruthy();
    expect((await CwcStation.findOne({ code: '011-mgd4ptn' }).lean()).status).toBe('WARNING'); // and it cleared nothing
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, []);
    await ingestCwc({ now: NOW }); // a real, empty list does clear them
    expect((await CwcStation.findOne({ code: '011-mgd4ptn' }).lean()).status).toBeNull();
  });

  test('a field near a gauge above warning gets it, with the rounded distance and the trend; no exact distance', async () => {
    mockCwc(); await ingestCwc({ now: NOW });
    const g = await gaugeFor(BIHAR, NOW);
    expect(g).toMatchObject({ status: 'ok', name: 'Dumariaghat', level: 'watch', trend: 'steady' });
    expect(g.km % 5).toBe(0);
    expect(g.alert).toMatchObject({ id: expect.stringMatching(/^CWC\|011-mgd4ptn\|2026-10-25$/), origin: 'official', source: 'cwc', issuer: 'CWC', level: 'watch', family: 'flood', station: 'Dumariaghat', date: '2026-10-25', offset: 0,
      from: '2026-10-25T00:00', to: '2026-10-26T00:00', expires: '2026-10-25T18:30:00.000Z', link: 'https://ffs.india-water.gov.in/' });
    expect(JSON.stringify(g)).not.toMatch(/26\.4|84\.72/);
  });

  test('DANGER is a warning; a gauge below warning is reported without an alert; nothing within 25 km is "none"', async () => {
    mockCwc(); await ingestCwc({ now: NOW });
    await CwcStation.updateOne({ code: '011-mgd4ptn' }, { $set: { status: 'DANGER', trend: 'rising' } });
    expect(await gaugeFor(BIHAR, NOW)).toMatchObject({ level: 'warn', trend: 'rising', alert: { level: 'warn' } });
    await CwcStation.updateMany({}, { $set: { status: null, trend: null } });
    const calm = await gaugeFor(BIHAR, NOW);
    expect(calm).toMatchObject({ status: 'ok', level: null });
    expect(calm.alert).toBeUndefined();
    expect(await gaugeFor(LUDHIANA, NOW)).toEqual({ status: 'none' }); // the nearest station in the fixture is 79 km away
  });
});

describe('GET /api/fields/alerts with the flood signals', () => {
  const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
  const pad = (n) => String(n).padStart(2, '0');
  const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const meteo = () => {
    const today = new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
    const time = [];
    for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${add(today, i)}T${pad(h)}:00`);
    return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: time.map(() => 20), relative_humidity_2m: time.map(() => 60), precipitation: time.map(() => 0) } };
  };
  const mockMeteo = (status = 200) => nock('http://meteo.test').get('/v1/forecast').query(true).reply(status, status === 200 ? meteo() : 'x');
  const save = (lat, lon) => request(app).post('/api/fields').set('x-device-id', DEVICE).send({ crop: 'rice', stage: 'flowering', lat, lon, name: 'Plot' });
  const alerts = () => request(app).get('/api/fields/alerts').set('x-device-id', DEVICE);
  // the flood sources on, official feeds off
  const on = () => { process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd'; };
  const todayIst = () => new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
  // the real Ludhiana answer re-dated to start today, so that "today" is the first day
  const redated = (f) => f.map((p) => ({ ...p, daily: { ...p.daily, time: p.daily.time.map((_, i) => add(todayIst(), i - 1)) } }));

  test('river and gauge are reported for the field, never its place; "no river" and "no gauge" are said, not left out', async () => {
    on();
    await save(30.9012, 75.8573); mockMeteo();
    mockForecast(redated(fx('forecast_ludhiana.json'))); mockClimate(fx('climate_ludhiana.json'));
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, fx('cwc_status.json'));
    nock(CWC).get('/iam/api/layer-station-geo/specification/').query(true).reply(200, fx('cwc_stations.json'));
    const res = await alerts();
    expect(res.status).toBe(200);
    const [f] = res.body.fields;
    expect(f.flood.river).toMatchObject({ status: 'ok', level: null });
    expect(f.flood.gauge).toEqual({ status: 'none' });
    expect(f.flood.radar).toEqual({ status: 'disabled' }); // no geo-service configured in these tests
    expect(f.alerts.filter((a) => a.hazard === 'flood_river')).toEqual([]);
    expect(res.body.officialSources.map((s) => [s.source, s.state])).toEqual([['sachet', 'disabled'], ['imd', 'disabled'], ['cwc', 'ok']]);
    expect(JSON.stringify(res.body)).not.toMatch(/30\.9012|75\.8573/);
  });

  test('a river alert is among the field\'s alerts, and an official gauge alert among its official ones', async () => {
    on();
    await save(26.4, 84.72); mockMeteo();
    // the Sutlej series stands in for a big river here: rising past its own 99th percentile
    const f = redated(fx('forecast_ludhiana.json'));
    f.forEach((p, i) => { p.daily.river_discharge = p.daily.river_discharge.map((v, k) => (i === 1 ? (k < 3 ? 200 : 900) : v)); });
    mockForecast(f); mockClimate(fx('climate_ludhiana.json'));
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, fx('cwc_status.json'));
    nock(CWC).get('/iam/api/layer-station-geo/specification/').query(true).reply(200, fx('cwc_stations.json'));
    const [field] = (await alerts()).body.fields;
    expect(field.alerts.find((a) => a.hazard === 'flood_river')).toMatchObject({ level: 'warn', confidence: 'low', reviewStatus: 'draft' });
    expect(field.official).toEqual([expect.objectContaining({ source: 'cwc', level: 'watch', station: 'Dumariaghat' })]);
    expect(field.flood.gauge).toMatchObject({ status: 'ok', name: 'Dumariaghat', level: 'watch' });
  });

  test('each signal fails alone: Open-Meteo\'s flood API down, and the gauges still answer; and the weather is unaffected', async () => {
    on();
    await save(26.4, 84.72); mockMeteo();
    nock(FLOOD).get('/v1/flood').query(true).times(2).reply(503);
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(200, fx('cwc_status.json'));
    nock(CWC).get('/iam/api/layer-station-geo/specification/').query(true).reply(200, fx('cwc_stations.json'));
    const [field] = (await alerts()).body.fields;
    expect(field).toMatchObject({ status: 'ok', flood: { river: { status: 'unavailable' }, gauge: { status: 'ok' } } });
  });

  test('a river alert is shown even when the field\'s weather did not load', async () => {
    on();
    await save(30.9012, 75.8573); mockMeteo(503);
    const f = redated(fx('forecast_ludhiana.json'));
    f[1].daily.river_discharge = f[1].daily.river_discharge.map((v, k) => (k < 3 ? 200 : 900));
    mockForecast(f); mockClimate(fx('climate_ludhiana.json'));
    nock(CWC).get('/ffm/api/station-water-level-above-warning/').reply(503);
    const [field] = (await alerts()).body.fields;
    expect(field.status).toBe('weather_unavailable');
    expect(field.alerts).toEqual([expect.objectContaining({ hazard: 'flood_river' })]);
    expect(field.flood.gauge).toEqual({ status: 'unavailable' }); // the gauge source is down: not "no gauge here"
  });

  test('the kill switches say disabled', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas';
    await save(30.9012, 75.8573); mockMeteo();
    const [field] = (await alerts()).body.fields;
    expect(field.flood).toEqual({ river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } });
  });
});
