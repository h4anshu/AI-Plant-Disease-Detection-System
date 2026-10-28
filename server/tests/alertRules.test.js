import { describe, expect, test } from '@jest/globals';
import { RULES, STAGES, conditions, dryRuns, evaluate, futureDays, horizon, localHour, localHourFraction } from '../utils/alertRules.js';

// "Now" is Tue 23 Feb 2027, 18:10 in India (UTC+5:30), like the design: the forecast covers Tue evening to Fri.
const NOW = new Date('2027-02-23T12:40:00Z');
const TODAY = '2027-02-23';
const [TUE, WED, THU, FRI] = ['2027-02-23', '2027-02-24', '2027-02-25', '2027-02-26'];
const pad = (n) => String(n).padStart(2, '0');
const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// 19 local days (14 past + today + 4), hourly. `fn(date, hour)` overrides { temp, rain } of an hour; the rest is a mild,
// dry day: 8 °C before 06:00, 18 °C after.
const weather = (fn = () => ({}), { start = '2027-02-09', days = 19 } = {}) => {
  const time = []; const temp = []; const rain = [];
  for (let i = 0; i < days; i++) {
    const date = add(start, i);
    for (let h = 0; h < 24; h++) {
      const o = fn(date, h) || {};
      time.push(`${date}T${pad(h)}:00`);
      temp.push(o.temp !== undefined ? o.temp : h < 6 ? 8 : 18);
      rain.push(o.rain ?? (h === 3 ? 3 : 0)); // a 3 mm shower each night keeps the default week from being a dry spell
    }
  }
  return { time, temp, rain, rh: temp.map(() => 60), utcOffsetSeconds: 19800, timezone: 'Asia/Kolkata' };
};
// a whole local date at one temperature at its coldest/hottest hour
const night = (date, v) => (d, h) => (d === date && h === 4 ? { temp: v } : null);
const combine = (...fns) => (d, h) => fns.reduce((o, f) => ({ ...o, ...(f(d, h) || {}) }), {});
const hot = (date, v) => (d, h) => (d === date && h === 15 ? { temp: v } : null);
const wet = (date, mm) => (d, h) => (d === date && h >= 12 && h < 18 ? { rain: mm / 6 } : null);

const wheat = { crop: 'wheat', stage: 'flowering' };
const rules = (alerts) => alerts.map((a) => a.rule);

describe('time helpers', () => {
  test('local hour and fraction follow the weather API UTC offset', () => {
    expect(localHour(19800, NOW)).toBe('2027-02-23T18');
    expect(localHourFraction(19800, NOW)).toBeCloseTo(18 + 10 / 60);
    expect(localHour(-18000, NOW)).toBe('2027-02-23T07'); // the same instant in New York
  });
  test('futureDays keeps only hours that have not passed and skips hours without a temperature', () => {
    const w = weather((d, h) => (d === TUE && h === 20 ? { temp: null } : null));
    const days = futureDays(w, localHour(19800, NOW), TODAY, 4);
    expect(days.map((d) => d.date)).toEqual([TUE, WED, THU, FRI]);
    expect(days[0].hours.map((x) => x.h)).toEqual([18, 19, 21, 22, 23]); // 20:00 had no temperature
    expect(days[1].hours).toHaveLength(24);
  });
});

describe('frost', () => {
  test('wheat at flowering, 1.4 °C on Wednesday night: a warning with the cold hours, the 3 nights and the draft mark', () => {
    const w = weather(combine(night(WED, 1.4), night(THU, 3.1), night(FRI, 5.2), (d, h) => (d === WED && h < 6 && h !== 4 ? { temp: 3 } : null)));
    const alerts = evaluate(wheat, w, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: 'FROST-WHEAT-1', hazard: 'frost', level: 'warn', date: WED, offset: 1, from: `${WED}T00:00`, to: `${WED}T06:00`,
      stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft',
    });
    expect(alerts[0].values).toMatchObject({ metric: 'tmin', value: 1.4, threshold: 2, levels: { warn: 2, watch: 4 } });
    expect(alerts[0].values.series).toEqual([{ date: WED, value: 1.4 }, { date: THU, value: 3.1 }, { date: FRI, value: 5.2 }]);
  });

  test('3.1 °C is only a watch; 4.0 is still a watch, 4.1 is nothing', () => {
    expect(evaluate(wheat, weather(night(WED, 3.1)), NOW)[0]).toMatchObject({ level: 'watch', date: WED });
    expect(evaluate(wheat, weather(night(WED, 4)), NOW)[0]).toMatchObject({ level: 'watch' });
    expect(evaluate(wheat, weather(night(WED, 4.1)), NOW)).toEqual([]);
  });

  test('a stage that tolerates cold stays silent, so does a crop without a frost rule', () => {
    const cold = weather(night(WED, 0));
    for (const stage of ['sowing', 'vegetative', 'harvest_ready']) expect(evaluate({ crop: 'wheat', stage }, cold, NOW)).toEqual([]);
    expect(evaluate({ crop: 'rice', stage: 'flowering' }, cold, NOW)).toEqual([]);
    expect(rules(evaluate({ crop: 'potato', stage: 'vegetative' }, cold, NOW))).toEqual(['FROST-POTATO-1']);
  });

  test('the third night ahead is a long lead: a warning there is shown as a watch', () => {
    expect(evaluate(wheat, weather(night(FRI, 0)), NOW)[0]).toMatchObject({ rule: 'FROST-WHEAT-1', level: 'watch', date: FRI, confidence: 'low' });
  });

  test('cold hours that have already passed are history; after midnight the same hours count', () => {
    const w = weather(night(TUE, 1.5));
    expect(evaluate(wheat, w, NOW)).toEqual([]); // 04:00 today is behind us at 18:10
    const at3am = new Date('2027-02-22T21:40:00Z'); // 03:10 on Tue 23 Feb in India
    expect(evaluate(wheat, w, at3am)[0]).toMatchObject({ rule: 'FROST-WHEAT-1', level: 'warn', date: TUE, offset: 0 });
  });

  test('the worst night wins, the earliest on a tie', () => {
    const a = evaluate(wheat, weather(combine(night(WED, 3), night(THU, 1))), NOW);
    expect(a[0]).toMatchObject({ level: 'warn', date: THU });
    const b = evaluate(wheat, weather(combine(night(WED, 1), night(THU, 1))), NOW);
    expect(b[0]).toMatchObject({ level: 'warn', date: WED });
  });
});

describe('heat', () => {
  test('wheat: 35 °C once is a watch; 37 °C on two days in a row is a warning', () => {
    expect(evaluate(wheat, weather(hot(WED, 35)), NOW)[0]).toMatchObject({ rule: 'HEAT-WHEAT-1', level: 'watch', date: WED });
    expect(evaluate(wheat, weather(combine(hot(WED, 37), hot(THU, 37))), NOW)[0]).toMatchObject({ rule: 'HEAT-WHEAT-1', level: 'warn', date: WED });
    expect(evaluate(wheat, weather(hot(WED, 37)), NOW)[0]).toMatchObject({ level: 'watch' }); // one hot day alone
    expect(evaluate(wheat, weather(hot(WED, 33.9)), NOW)).toEqual([]);
  });
  test('heat on the third day ahead is capped at a watch even when the next day is hot too', () => {
    expect(evaluate(wheat, weather(combine(hot(THU, 37), hot(FRI, 37))), NOW)[0]).toMatchObject({ level: 'watch', date: THU });
  });
  test('rice only at flowering: 33 watch, 35 warning', () => {
    const rice = { crop: 'rice', stage: 'flowering' };
    expect(evaluate(rice, weather(hot(WED, 33)), NOW)[0]).toMatchObject({ rule: 'HEAT-RICE-1', level: 'watch' });
    expect(evaluate(rice, weather(hot(WED, 35)), NOW)[0]).toMatchObject({ level: 'warn' });
    expect(evaluate({ crop: 'rice', stage: 'vegetative' }, weather(hot(WED, 36)), NOW)).toEqual([]);
  });
  test('a heat wave (40 °C) is flagged for any crop and stage', () => {
    expect(evaluate({ crop: 'maize', stage: 'sowing' }, weather(hot(WED, 41)), NOW)[0]).toMatchObject({ rule: 'HEAT-ANY-1', hazard: 'heatwave', level: 'watch' });
  });
});

describe('rain', () => {
  const potato = { crop: 'potato', stage: 'harvest_ready' };
  test('rain before harvest: 18 mm on Thursday is a watch, 45 mm on Wednesday a warning', () => {
    expect(evaluate(potato, weather(wet(THU, 18)), NOW)).toMatchObject([{ rule: 'RAIN-HARVEST-1', level: 'watch', date: THU, offset: 2 }]);
    const a = evaluate(potato, weather(wet(WED, 45)), NOW);
    expect(rules(a)).toEqual(['RAIN-HARVEST-1']); // the "heavy rain" rule on the same day is not shown twice
    expect(a[0]).toMatchObject({ level: 'warn', values: { value: 48, threshold: 30 } });
  });
  test('heavy rain at any stage: 70 mm is a warning, 45 mm a watch, and it replaces the spraying hint that day', () => {
    const maize = { crop: 'maize', stage: 'vegetative' };
    expect(rules(evaluate(maize, weather(wet(WED, 70)), NOW))).toEqual(['RAIN-HEAVY-1']);
    expect(evaluate(maize, weather(wet(WED, 70)), NOW)[0].level).toBe('warn');
    expect(evaluate(maize, weather(wet(WED, 45)), NOW)[0].level).toBe('watch');
  });
  test('postpone spraying: 12 mm tomorrow is an info, 12 mm in two days is not mentioned', () => {
    const maize = { crop: 'maize', stage: 'flowering' };
    expect(evaluate(maize, weather(wet(WED, 12)), NOW)[0]).toMatchObject({ rule: 'RAIN-SPRAY-1', level: 'info' });
    expect(evaluate(maize, weather(wet(THU, 12)), NOW)).toEqual([]);
    expect(evaluate({ crop: 'maize', stage: 'harvest_ready' }, weather(wet(WED, 12)), NOW)[0].rule).toBe('RAIN-HARVEST-1');
  });
  test('rain that already fell today does not count at 18:10', () => {
    expect(evaluate({ crop: 'maize', stage: 'vegetative' }, weather((d, h) => (d === TUE && h === 8 ? { rain: 50 } : null)), NOW)).toEqual([]);
  });
});

describe('choosing what to show', () => {
  test('at most 3 alerts: warnings first, then watches by date and rule order, info last', () => {
    const w = weather(combine(night(WED, 1), hot(THU, 35), wet(THU, 45), wet(WED, 12)));
    const a = evaluate(wheat, w, NOW);
    expect(a).toHaveLength(3);
    expect(a.map((x) => [x.rule, x.level])).toEqual([['FROST-WHEAT-1', 'warn'], ['HEAT-WHEAT-1', 'watch'], ['RAIN-HEAVY-1', 'watch']]);
  });
  test('every rule has an id, a hazard, levels and only known stages', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) {
      expect(r.id).toMatch(/^[A-Z]+(-[A-Z]+)?-\d+$/);
      expect(typeof r.test).toBe('function');
      expect(Object.keys(r.levels).length).toBeGreaterThan(0);
      for (const s of r.stages ?? []) expect(STAGES).toContain(s);
    }
  });
  test('alerts hold no coordinates', () => {
    const a = evaluate(wheat, weather(night(WED, 1)), NOW);
    expect(JSON.stringify(a)).not.toMatch(/lat|lon|coordinates/i);
  });
});

describe('missing data is never an empty list', () => {
  test('a series with no temperature left throws, so the field shows "weather unavailable"', () => {
    const empty = weather(() => ({ temp: null }));
    expect(() => evaluate(wheat, empty, NOW)).toThrow('no forecast hours');
  });
  test('a series that ended before now throws too', () => {
    expect(() => evaluate(wheat, weather(() => ({}), { start: '2027-01-01', days: 20 }), NOW)).toThrow();
  });
});

describe('the 72-hour strip and the conditions', () => {
  const w = weather(combine(night(WED, 1.4), hot(WED, 19.5), (d, h) => (d === WED && h === 8 ? { temp: 6 } : null), wet(THU, 6), (d, h) => (h === 12 ? { rain: 2 } : null)));
  test('3 days x 4 parts, night = lowest, noon = highest, past parts flagged, now as a fractional part index', () => {
    const h = horizon(w, TODAY, localHourFraction(19800, NOW));
    expect(h.days.map((d) => d.date)).toEqual([TUE, WED, THU]);
    expect(h.days.every((d) => d.slots.length === 4)).toBe(true);
    expect(h.days[0].slots.map((s) => s.past)).toEqual([true, true, true, false]);
    expect(h.days[1].slots.map((s) => s.past)).toEqual([false, false, false, false]);
    expect(h.days[1].slots[0].t).toBe(1.4);
    expect(h.days[1].slots[2].t).toBe(19.5);
    expect(h.days[2].slots[2].rain).toBeGreaterThan(5);
    expect(h.now).toBeCloseTo(3.03, 1);
  });
  test('conditions: rain of the last 7 days and the coldest night ahead', () => {
    // 14 mm that fell by hand in the fixture + the 3 mm night shower of each of the 7 days
    expect(conditions(w, TODAY, localHour(19800, NOW))).toEqual({ rain7: 35, coldest: { t: 1.4, date: WED } });
  });
  test('rain7 is null when the past week is not all there', () => {
    const short = weather(() => ({}), { start: '2027-02-20', days: 8 });
    expect(conditions(short, TODAY, localHour(19800, NOW)).rain7).toBeNull();
  });
});

describe('dry spell', () => {
  const rice = { crop: 'rice', stage: 'flowering' };
  const bone = () => ({ rain: 0 });                                   // no rain at all, every hour
  const shower = (date, mm = 6) => (d, h) => (d === date && h === 14 ? { rain: mm } : null);
  const dry = (...showers) => weather(combine(bone, ...showers));
  const dryAlerts = (field, w) => evaluate(field, w, NOW).filter((a) => a.hazard === 'dry_spell');

  test('runs of dry days: under 2.5 mm in a local day is dry, 2.5 is not; the run counts up to each day', () => {
    const runs = dryRuns(dry(shower('2027-02-16', 2.4), shower('2027-02-20', 2.5)));
    expect(runs.get('2027-02-09')).toBe(1);
    expect(runs.get('2027-02-16')).toBe(8);   // 2.4 mm is still a dry day
    expect(runs.get('2027-02-20')).toBe(0);   // 2.5 mm is not
    expect(runs.get(TUE)).toBe(3);            // 21, 22, 23
    expect(runs.get(FRI)).toBe(6);
  });

  test('a long dry run at a sensitive stage: 15 days is a warning, with the run for each of the 3 days as its chart', () => {
    const [a] = dryAlerts(rice, dry());
    expect(a).toMatchObject({ rule: 'DRY-SPELL-1', hazard: 'dry_spell', level: 'warn', date: TUE, offset: 0, reviewStatus: 'draft',
      values: { metric: 'dry', value: 15, threshold: 14, levels: { warn: 14, watch: 7 }, series: [{ date: TUE, value: 15 }, { date: WED, value: 16 }, { date: THU, value: 17 }] } });
  });

  test('7 days is a watch, counted from the last real shower', () => {
    const [a] = dryAlerts(rice, dry(shower('2027-02-16')));       // dry on 17 to 23 = 7 days
    expect(a).toMatchObject({ rule: 'DRY-SPELL-1', level: 'watch', date: TUE, values: { value: 7, threshold: 7 } });
  });

  test('a run that reaches 7 tomorrow is announced for tomorrow, and 5 days is nothing yet', () => {
    const [a] = dryAlerts(rice, dry(shower('2027-02-17')));       // 6 today, 7 tomorrow
    expect(a).toMatchObject({ level: 'watch', date: WED, offset: 1, values: { value: 7 } });
    expect(dryAlerts(rice, dry(shower('2027-02-19')))).toEqual([]); // 4 today, 6 on Thursday
  });

  test('a shower in the forecast ends the spell for the days after it, not before', () => {
    const [a] = dryAlerts(rice, dry(shower(WED, 20)));
    expect(a).toMatchObject({ level: 'warn', date: TUE, values: { value: 15, series: [{ value: 15 }, { value: 0 }, { value: 1 }] } });
  });

  test('the third day ahead never says warning', () => {
    const [a] = dryAlerts(rice, dry(shower('2027-02-11')));         // 12 today, 13 tomorrow, 14 on Thursday
    expect(a).toMatchObject({ level: 'watch', date: TUE });
    const [b] = dryAlerts({ crop: 'rice', stage: 'sowing' }, dry(shower('2027-02-11')));
    expect(b.level).toBe('watch');
  });

  test('vegetative stage waits for 14 days and only watches; harvest, irrigated crops and unlisted stages stay silent', () => {
    expect(dryAlerts({ crop: 'maize', stage: 'vegetative' }, dry(shower('2027-02-16')))).toEqual([]);
    expect(dryAlerts({ crop: 'maize', stage: 'vegetative' }, dry())[0]).toMatchObject({ rule: 'DRY-SPELL-2', level: 'watch', values: { levels: { watch: 14 } } });
    expect(dryAlerts({ crop: 'rice', stage: 'harvest_ready' }, dry())).toEqual([]);
    for (const crop of ['wheat', 'potato', 'apple', 'banana', 'sugarcane']) expect(dryAlerts({ crop, stage: 'flowering' }, dry())).toEqual([]);
    for (const crop of ['rice', 'maize', 'groundnut', 'pigeonpea', 'blackgram']) expect(dryAlerts({ crop, stage: 'flowering' }, dry())).toHaveLength(1);
  });

  test('a normally rainy week is no spell, and the window is the rest of the day', () => {
    expect(dryAlerts(rice, weather())).toEqual([]);                  // the default fixture has a 3 mm night shower every day
    const [a] = dryAlerts(rice, dry());
    expect(a).toMatchObject({ from: `${TUE}T18:00`, to: `${WED}T00:00` });
  });
});
