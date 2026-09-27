import { describe, expect, test } from '@jest/globals';
import {
  classEntry, contextFit, evaluateRule, factorValue, fit, holds, KB, MIN_COVERAGE, windowDays,
} from '../utils/environmentFit.js';

const REF = '2026-09-20';
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// 14 days up to REF + 3 outlook, every day the same unless overridden
const snapshot = ({ day = {}, perDay = () => ({}), soil = null, season = ['kharif'], riskModel = null } = {}) => ({
  reference: { date: REF, source: 'created_at' },
  weather: { days: [...Array(17)].map((_, i) => { const date = addDays(REF, i - 13);
    return { date, tmin: 20, tmean: 26, tmax: 32, rhMean: 80, rhMax: 95, hoursRh90: 6, rain: 1, ...day, ...perDay(date, i) }; }) },
  soil, season: { names: season }, riskModel,
});
const rule = (extra) => ({ id: 'x.y.1', factor: 'tmean', op: 'between', value: [25, 34], unit: '°C', window_days: 7, role: 'favourable', weight: 1, source_id: 's', ...extra });
const entry = (rules, extra = {}) => ({ crop: 'x', class: 'y', cause_type: 'fungal', rules, model_ref: null, review_status: 'draft',
  sources: [{ id: 's', title: 'Source', url: 'https://example.org' }], no_rule_reason: '', ...extra });

describe('operators and threshold edges', () => {
  test.each([
    ['lt', 29.9, 30, true], ['lt', 30, 30, false],
    ['le', 30, 30, true], ['le', 30.1, 30, false],
    ['gt', 70.1, 70, true], ['gt', 70, 70, false],
    ['ge', 70, 70, true], ['ge', 69.9, 70, false],
    ['between', 25, [25, 34], true], ['between', 34, [25, 34], true], ['between', 24.9, [25, 34], false], ['between', 34.1, [25, 34], false],
    ['in', ['rabi', 'zaid'], ['zaid'], true], ['in', ['kharif'], ['zaid'], false], ['in', 'zaid', ['zaid'], true],
  ])('%s %p vs %p -> %p', (op, actual, threshold, want) => expect(holds(op, actual, threshold)).toBe(want));

  test('unknown operator is an error, not a silent false', () => expect(() => holds('eq', 1, 1)).toThrow());
});

describe('factor values from the snapshot', () => {
  test('the window is the N days ending on the reference day; the outlook is never used', () => {
    const s = snapshot();
    expect(windowDays(s, 7).map((d) => d.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
    const hot = snapshot({ perDay: (d) => (d > REF ? { tmean: 45 } : {}) });
    expect(factorValue(rule(), hot).value).toBe(26);
  });

  test('mean, minimum and wet-day counts', () => {
    const s = snapshot({ perDay: (d, i) => ({ tmean: 20 + i, hoursRh90: i % 2 ? 12 : 5 }) });
    expect(factorValue(rule({ window_days: 3 }), s).value).toBe(32); // days 11..13 -> 31, 32, 33
    expect(factorValue(rule({ factor: 'tmeanMin', window_days: 14 }), s).value).toBe(20);
    expect(factorValue(rule({ factor: 'wetDays', hours: 12, window_days: 7 }), s).value).toBe(4); // days 7, 9, 11, 13
    // 5.1 h needs 6 whole hours: 5 does not count
    expect(factorValue(rule({ factor: 'wetDays', hours: 5.1, window_days: 7 }), s).value).toBe(4);
    expect(factorValue(rule({ factor: 'wetDays', hours: 5, window_days: 7 }), s).value).toBe(7);
  });

  test(`missing data: fewer than ${MIN_COVERAGE * 100}% of the window's days -> missing, never a guess`, () => {
    const gaps = (n) => snapshot({ perDay: (d, i) => (i >= 7 && i < 7 + n ? { tmean: null } : {}) });
    expect(factorValue(rule(), gaps(2)).value).toBe(26); // 5 of 7 days = 71%
    expect(factorValue(rule(), gaps(3))).toEqual({ missing: 'too_few_days' }); // 4 of 7
  });

  test('wet days need hourly humidity: ERA5-Land days say so', () => {
    const era5 = snapshot({ day: { hoursRh90: null, rhMax: null } });
    expect(factorValue(rule({ factor: 'wetDays', hours: 12 }), era5)).toEqual({ missing: 'needs_hourly_humidity' });
  });

  test('soil pH: the farmer\'s card first, SoilGrids otherwise; nutrients only from the card', () => {
    const s = snapshot({ soil: { topsoil0to30: { phH2O: 7.8, nitrogenGkg: 8.1 } } });
    const ph = rule({ factor: 'soil.ph', op: 'lt', value: 5.5, unit: 'pH', window_days: null });
    expect(factorValue(ph, s)).toEqual({ value: 7.8, from: 'soilgrids' });
    expect(factorValue(ph, s, { ph: 5.2 })).toEqual({ value: 5.2, from: 'soil_test' });
    expect(factorValue(ph, snapshot())).toEqual({ missing: 'no_soil_data' });
    const n = rule({ factor: 'soilTest.availableN', op: 'lt', value: 280, unit: 'kg/ha', window_days: null });
    expect(factorValue(n, s)).toEqual({ missing: 'needs_soil_test' });
    expect(factorValue(n, s, { availableN: 250 })).toEqual({ value: 250, from: 'soil_test' });
  });

  test('season list', () => {
    const r = rule({ factor: 'season', op: 'in', value: ['zaid'], unit: 'season', window_days: null });
    expect(evaluateRule(r, snapshot({ season: ['rabi', 'zaid'] }), null, entry([r])).status).toBe('met');
    expect(evaluateRule(r, snapshot({ season: ['kharif'] }), null, entry([r])).status).toBe('not_met');
  });

  test('an evaluated rule shows the actual value, the threshold and its source', () => {
    const r = rule({ reading: 'our reading' });
    expect(evaluateRule(r, snapshot(), null, entry([r]))).toMatchObject({
      ruleId: 'x.y.1', status: 'met', actual: 26, threshold: [25, 34], unit: '°C', windowDays: 7, from: 'weather',
      label: 'mean daily temperature', reading: 'our reading', source: { id: 's', title: 'Source', url: 'https://example.org' } });
  });
});

describe('scoring', () => {
  const t = rule({ id: 't' });
  const h = rule({ id: 'h', factor: 'rhMean', op: 'gt', value: 70, unit: '%' });
  const w = rule({ id: 'w', factor: 'wetDays', hours: 12, op: 'ge', value: 1, unit: 'days', weight: 2 });

  test('all favourable conditions present -> favourable 1', () => {
    const f = fit(entry([t, h]), snapshot());
    expect(f).toMatchObject({ level: 'favourable', score: 1, reason: null, draft: true });
    expect(f.matched.map((i) => i.ruleId)).toEqual(['t', 'h']);
  });
  test('half -> neutral; none -> unfavourable', () => {
    expect(fit(entry([t, h]), snapshot({ day: { rhMean: 60 } }))).toMatchObject({ level: 'neutral', score: 0.5 });
    const none = fit(entry([t, h]), snapshot({ day: { rhMean: 60, tmean: 20 } }));
    expect(none).toMatchObject({ level: 'unfavourable', score: 0 });
    expect(none.unmatched).toHaveLength(2);
  });
  test('weights: the wetness rule (weight 2) outweighs temperature', () => {
    expect(fit(entry([t, w]), snapshot({ day: { tmean: 20, hoursRh90: 14 } }))).toMatchObject({ level: 'favourable', score: 0.67 });
    expect(fit(entry([t, w]), snapshot({ day: { hoursRh90: 3 } }))).toMatchObject({ level: 'unfavourable', score: 0.33 });
  });
  test('an unfavourable rule supports the disease when it does NOT hold', () => {
    const cold = rule({ id: 'c', factor: 'tmean', op: 'lt', value: 10, role: 'unfavourable' });
    expect(fit(entry([cold]), snapshot())).toMatchObject({ level: 'favourable', score: 1 });
    expect(fit(entry([cold]), snapshot({ day: { tmean: 5 } }))).toMatchObject({ level: 'unfavourable', score: 0 });
  });
  test('missing rules carrying half the weight or more -> unknown', () => {
    const era5 = snapshot({ day: { hoursRh90: null } });
    expect(fit(entry([t, w]), era5)).toMatchObject({ level: 'unknown', score: null, reason: 'missing_data' }); // 2 of 3 missing
    const f = fit(entry([t, h, w]), era5); // 2 of 4 missing: still unknown (>= half)
    expect(f.level).toBe('unknown');
    expect(f.missing.map((i) => i.ruleId)).toEqual(['w']);
    const three = fit(entry([t, h, rule({ id: 'x', factor: 'tmin', op: 'lt', value: 30 }), w]), era5); // 2 of 5
    expect(three).toMatchObject({ level: 'favourable', score: 1 });
  });
  test('combine "any" (a nutrient deficiency): one deficient value is enough', () => {
    const n = rule({ id: 'n', factor: 'soilTest.availableN', op: 'lt', value: 280, unit: 'kg/ha', window_days: null });
    const zn = rule({ id: 'zn', factor: 'soilTest.zn', op: 'lt', value: 0.6, unit: 'ppm', window_days: null });
    const e = entry([n, zn], { combine: 'any' });
    expect(fit(e, snapshot(), { availableN: 400, zn: 0.4 })).toMatchObject({ level: 'favourable' });
    expect(fit(e, snapshot(), { availableN: 400, zn: 1.2 })).toMatchObject({ level: 'unfavourable' });
    expect(fit(e, snapshot(), { availableN: 400 })).toMatchObject({ level: 'unfavourable' }); // half checked, none deficient
    expect(fit(e, snapshot(), null)).toMatchObject({ level: 'unknown', reason: 'missing_data' });
  });
});

describe('special classes', () => {
  test('a class with a published model takes its level from the stored model result', () => {
    const blast = classEntry('rice', 'Blast');
    const m = (level) => snapshot({ riskModel: { name: 'Yoshino infection hours', date: REF, level, conditions: { infectionHours: 4 } } });
    expect(fit(blast, m('high'))).toMatchObject({ level: 'favourable', score: 1, model: { key: 'diseaseRisk:yoshino', level: 'high' } });
    expect(fit(blast, m('medium'))).toMatchObject({ level: 'neutral', score: 0.5 });
    expect(fit(blast, m('low'))).toMatchObject({ level: 'unfavourable', score: 0 });
    expect(fit(blast, m(null))).toMatchObject({ level: 'unknown', score: null });
    expect(fit(blast, snapshot({ riskModel: { name: 'x', level: null, reason: 'needs_hourly_weather' } }))).toMatchObject({ level: 'unknown', reason: 'needs_hourly_weather' });
  });
  test('healthy -> unknown, reason healthy, never a draft warning', () => {
    expect(fit(classEntry('rice', 'Healthy'), snapshot())).toMatchObject({ level: 'unknown', reason: 'healthy', draft: false });
  });
  test('no sourced rule -> unknown with the written reason', () => {
    const f = fit(classEntry('rice', 'Tungro'), snapshot());
    expect(f).toMatchObject({ level: 'unknown', reason: 'no_rules' });
    expect(f.noRuleReason).toMatch(/Vector-borne/);
  });
});

describe('real knowledge-base entries', () => {
  test('rice bacterial blight on a warm humid week is favourable, with the IRRI citation', () => {
    const f = fit(classEntry('rice', 'Bacterialblight'), snapshot({ day: { tmean: 29, rhMean: 84 } }));
    expect(f.level).toBe('favourable');
    expect(f.matched[0].source.url).toMatch(/knowledgebank\.irri\.org/);
  });
  test('Panama wilt reads SoilGrids pH when no card is entered', () => {
    const f = fit(classEntry('banana', 'Panama_Wilt'), snapshot({ soil: { topsoil0to30: { phH2O: 5.1 } } }));
    expect(f).toMatchObject({ level: 'favourable' });
    expect(f.matched[0].from).toBe('soilgrids');
  });
  test('contextFit: diagnosed class plus the other top-3 classes with their probabilities', () => {
    const r = contextFit({ crop: 'rice', disease: 'Brownspot', top3: [
      { disease: 'Brownspot', probability: 0.5 }, { disease: 'Blast', probability: 0.3 }, { disease: 'Nope', probability: 0.2 }] },
    snapshot({ day: { rhMean: 90, tmean: 27 } }));
    expect(r.diagnosed).toMatchObject({ class: 'Brownspot', level: 'favourable' });
    expect(r.alternatives.map((a) => [a.class, a.probability, a.level])).toEqual([['Blast', 0.3, 'unknown'], ['Nope', 0.2, 'unknown']]);
    expect(r.alternatives[1].reason).toBe('unknown_class');
    expect(contextFit({ crop: 'rice', disease: 'Healthy', top3: undefined }, snapshot()).alternatives).toEqual([]);
  });
  test('every rule in the knowledge base can be evaluated against a full snapshot', () => {
    const s = snapshot({ soil: { topsoil0to30: { phH2O: 7 } } });
    const card = { availableN: 300, availableP: 20, availableK: 200, ocPct: 0.6, zn: 1, fe: 5, s: 12, ph: 7 };
    for (const c of KB.classes) {
      for (const r of c.rules) expect(evaluateRule(r, s, card, c).status).not.toBe('missing');
    }
  });
});
