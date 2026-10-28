import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import nock from 'nock';
import { episodes, fetchArchive, replay, report, RUNS, score, summarize } from '../scripts/alert_backtest.js';

// The replay is the server's own rules run day by day on the weather of those days; here the weather is made up so that the answers can be
// checked by hand. (The real archive was used once, by hand, for docs/ALERT_BACKTEST.md.)
const pad = (n) => String(n).padStart(2, '0');
const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = '2026-01-01';
// 80 days from START: 8 C at night, 18 C by day, a 3 mm shower at 03:00 every day (so the default season is not a dry spell); `fn(date, hour)` overrides an hour
const weather = (fn = () => null, days = 80) => {
  const time = []; const temp = []; const rain = [];
  for (let i = 0; i < days; i++) for (let h = 0; h < 24; h++) {
    const date = add(START, i);
    const o = fn(date, h) || {};
    time.push(`${date}T${pad(h)}:00`);
    temp.push(o.temp ?? (h < 6 ? 8 : 18));
    rain.push(o.rain ?? (h === 3 ? 3 : 0));
  }
  return { time, temp, rain, rh: temp.map(() => 60), utcOffsetSeconds: 19800, timezone: 'Asia/Kolkata' };
};
const wheat = { crop: 'wheat', stage: 'flowering' };
const FROM = '2026-01-20';
const TO = '2026-03-10';                       // the weather runs to 2026-03-21: 4 days past TO are needed, 14 before FROM

beforeAll(() => { nock.disableNetConnect(); });
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('replay', () => {
  test('a mild season has no alert', () => {
    expect(replay(wheat, weather(), FROM, TO)).toEqual([]);
  });

  test('one cold night is one alert, first seen 3 days ahead (as a watch: the third day never says warning) and a warning by the night before', () => {
    const w = weather((d, h) => (d === '2026-02-14' && h === 4 ? { temp: 1 } : null));
    const alerts = replay(wheat, w, FROM, TO);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: 'FROST-WHEAT-1|2026-02-14', rule: 'FROST-WHEAT-1', hazard: 'frost', date: '2026-02-14', firstSeen: '2026-02-11', firstLevel: 'watch', maxLevel: 'warn', daysSeen: 3 });
  });

  test('two separate nights are two alerts; a run of hot days is one alert per day', () => {
    const w = weather((d, h) => (['2026-02-05', '2026-02-20'].includes(d) && h === 4 ? { temp: 3 } : (d >= '2026-03-01' && d <= '2026-03-03' && h === 15 ? { temp: 37 } : null)));
    const a = replay(wheat, w, FROM, TO);
    expect(a.filter((x) => x.hazard === 'frost').map((x) => x.date)).toEqual(['2026-02-05', '2026-02-20']);
    expect(a.filter((x) => x.hazard === 'frost').every((x) => x.maxLevel === 'watch')).toBe(true);   // 3 C: between 2 and 4
    expect(a.filter((x) => x.rule === 'HEAT-WHEAT-1').map((x) => x.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  test('the season edges: the first day sees 14 days back, the last day 4 days ahead, and nothing outside the weather is invented', () => {
    const w = weather((d, h) => (d === '2026-03-14' && h === 4 ? { temp: 1 } : null));      // 4 days after TO: seen from TO
    const a = replay(wheat, w, FROM, TO);
    expect(a.map((x) => [x.date, x.firstSeen])).toEqual([]);                                // 3 days ahead of TO is as far as a night is read
    const b = replay(wheat, weather((d, h) => (d === '2026-03-13' && h === 4 ? { temp: 1 } : null)), FROM, TO);
    expect(b.map((x) => [x.date, x.firstSeen])).toEqual([['2026-03-13', '2026-03-10']]);
  });

  test('a dry season is a dry spell that is announced once per date, and a rain-fed crop only', () => {
    const w = weather(() => ({ rain: 0 }));
    const rice = replay({ crop: 'rice', stage: 'flowering' }, w, FROM, TO);
    expect(rice.every((a) => a.rule === 'DRY-SPELL-1')).toBe(true);
    expect(rice.length).toBeGreaterThan(30);
    expect(replay(wheat, w, FROM, TO)).toEqual([]);
  });
});

describe('summarize', () => {
  const alerts = [
    { rule: 'A', maxLevel: 'warn', date: '2026-02-10', firstSeen: '2026-02-08' },
    { rule: 'A', maxLevel: 'watch', date: '2026-02-20', firstSeen: '2026-02-19' },
    { rule: 'B', maxLevel: 'info', date: '2026-02-21', firstSeen: '2026-02-21' },
  ];
  test('counts by rule and level, alerts per week and the ones above a tip', () => {
    const s = summarize(alerts, 14);
    expect(s.rows[0]).toMatchObject({ rule: 'A', warn: 1, watch: 1, info: 0, total: 2, leads: [2, 1] });
    expect(s.rows[1]).toMatchObject({ rule: 'B', info: 1, total: 1 });
    expect(s.perWeek).toBeCloseTo(1.5);
    expect(s.loudPerWeek).toBeCloseTo(1);
    expect(s.maxLead).toBe(2);
  });
});

describe('episodes', () => {
  const a = (rule, date) => ({ rule, date });
  test('consecutive dates of one rule are one episode; a gap of two days or another rule starts a new one', () => {
    expect(episodes([a('F', '2026-02-01'), a('F', '2026-02-02'), a('F', '2026-02-03')])).toBe(1);
    expect(episodes([a('F', '2026-02-01'), a('F', '2026-02-03')])).toBe(2);
    expect(episodes([a('F', '2026-02-01'), a('H', '2026-02-01'), a('F', '2026-02-02')])).toBe(2);
    expect(episodes([])).toBe(0);
  });
  test('a cold week is 7 alerts per week but one episode', () => {
    const week = Array.from({ length: 7 }, (_, i) => ({ rule: 'FROST-POTATO-1', maxLevel: 'warn', date: `2026-01-${10 + i}`, firstSeen: `2026-01-${10 + i}` }));
    const s = summarize(week, 7);
    expect(s.loudPerWeek).toBeCloseTo(7);
    expect(s.episodes).toBe(1);
    expect(s.episodesPerWeek).toBeCloseTo(1);
  });
});

describe('score against real events', () => {
  const loud = [
    { hazard: 'frost', maxLevel: 'warn', date: '2026-02-10', firstSeen: '2026-02-08' },
    { hazard: 'frost', maxLevel: 'watch', date: '2026-02-20', firstSeen: '2026-02-19' },
    { hazard: 'frost', maxLevel: 'info', date: '2026-02-25', firstSeen: '2026-02-25' },
    { hazard: 'heat', maxLevel: 'watch', date: '2026-03-01', firstSeen: '2026-03-01' },
  ];
  test('a hit is the same hazard within a day; lead is days between first sight and the event; misses are listed', () => {
    const s = score(loud, [{ date: '2026-02-11', hazard: 'frost' }, { date: '2026-03-30', hazard: 'frost' }]);
    expect(s).toMatchObject({ events: 2, hits: 1, pod: 0.5, leads: [3] });
    expect(s.missed).toEqual([{ date: '2026-03-30', hazard: 'frost' }]);
  });
  test('false alarms are judged only for hazards the event list covers, and a tip is never a false alarm', () => {
    const s = score(loud, [{ date: '2026-02-10', hazard: 'frost' }]);
    expect(s.judged).toBe(2);               // the two frost alerts above a tip; the heat watch is not judged: nobody listed heat events
    expect(s.far).toBeCloseTo(0.5);         // the 20 Feb frost has no event
  });
  test('no events: no rates', () => {
    expect(score(loud, [])).toMatchObject({ pod: null, hits: 0 });
  });
});

describe('the archive and the report', () => {
  test('the archive is asked for 14 days before the season and 4 after, in local time, and a bad answer throws', async () => {
    process.env.OPEN_METEO_ARCHIVE_URL = 'http://archive.test/v1/archive';
    const seen = [];
    nock('http://archive.test').get('/v1/archive').query((q) => { seen.push(q); return true; })
      .reply(200, { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time: ['2026-01-06T00:00'], temperature_2m: [9], relative_humidity_2m: [50], precipitation: [0] } });
    const w = await fetchArchive({ lat: 30.9, lon: 75.85, from: '2026-01-20', to: '2026-03-10' });
    expect(seen[0]).toMatchObject({ start_date: '2026-01-06', end_date: '2026-03-14', timezone: 'auto', hourly: 'temperature_2m,relative_humidity_2m,precipitation' });
    expect(w).toMatchObject({ time: ['2026-01-06T00:00'], temp: [9], rain: [0], utcOffsetSeconds: 19800 });
    nock('http://archive.test').get('/v1/archive').query(true).reply(200, { error: true, reason: 'x' });
    await expect(fetchArchive({ lat: 1, lon: 1, from: '2026-01-20', to: '2026-01-21' })).rejects.toThrow('no hourly data');
    delete process.env.OPEN_METEO_ARCHIVE_URL;
  });

  test('the report names the method, flags a season above the target and says how to get detection rates', () => {
    const alerts = Array.from({ length: 6 }, (_, i) => ({ rule: 'FROST-WHEAT-1', hazard: 'frost', maxLevel: 'warn', date: `2026-02-${10 + i}`, firstSeen: `2026-02-${8 + i}` }));
    const r = report([{ run: RUNS[0], days: 14, alerts, summary: summarize(alerts, 14), score: null }], null);
    expect(r).toContain('perfect forecast');
    expect(r).toContain('## Ludhiana wheat flowering, Feb-Mar 2026');
    expect(r).toContain('(above the target of 2)');
    expect(r).toContain('| FROST-WHEAT-1 | 0 | 0 | 6 | 6 | 2 |');
    expect(r).toContain('`label,date,hazard`');
  });
});
