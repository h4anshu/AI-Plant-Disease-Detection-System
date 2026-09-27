import fs from 'node:fs';
import { applyReview, CSV_PATH, loadRules, parseCsv, reviewRows, ruleText, toCsv } from '../scripts/rules_review.js';

const kb = loadRules();
const labelMaps = JSON.parse(fs.readFileSync(new URL('../../ml-service/data/label_maps.json', import.meta.url), 'utf8'));
const CAUSES = ['fungal', 'bacterial', 'viral', 'insect', 'nutrient', 'abiotic', 'healthy'];
const OPS = ['lt', 'le', 'gt', 'ge', 'between', 'in'];
const MODELS = ['diseaseRisk:indoBlightcast', 'diseaseRisk:yoshino'];
const clone = () => JSON.parse(JSON.stringify(kb));
const rules = kb.classes.flatMap((c) => c.rules.map((r) => [r.id, r, c]));

describe('knowledge base (server/knowledge/disease_rules.json)', () => {
  test('has exactly one entry for every class of every crop in the label maps (53)', () => {
    const want = Object.entries(labelMaps).flatMap(([crop, m]) => Object.keys(m).map((c) => `${crop}/${c}`)).sort();
    const have = kb.classes.map((c) => `${c.crop}/${c.class}`).sort();
    expect(have).toEqual(want);
    expect(have).toHaveLength(53);
  });

  test.each(kb.classes.map((c) => [`${c.crop}/${c.class}`, c]))('%s is well formed', (_, c) => {
    expect(CAUSES).toContain(c.cause_type);
    expect(c.cause).toBeTruthy();
    expect(['draft', 'reviewed']).toContain(c.review_status);
    expect(['high', 'med', 'low']).toContain(c.literature_confidence);
    expect(c.model_ref === null || MODELS.includes(c.model_ref)).toBe(true);
    expect(['any', undefined]).toContain(c.combine);
    // a class either has rules, a published model, or says why it has neither
    if (!c.rules.length && !c.model_ref) expect(c.no_rule_reason.length).toBeGreaterThan(10);
    if (c.cause_type === 'healthy') expect(c.rules).toEqual([]);
    for (const s of c.sources) {
      for (const k of ['id', 'title', 'publisher', 'url', 'section_or_page', 'quote_or_numbers']) expect(s[k]).toBeTruthy();
      expect(s.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(c.sources.map((s) => s.id)).size).toBe(c.sources.length);
  });

  test.each(rules)('rule %s: known factor, unit, operator, window and an existing source', (id, r, c) => {
    expect(id).toMatch(new RegExp(`^${c.crop}\\.${c.class}\\.`));
    const factor = kb.factors[r.factor];
    expect(factor.label).toBeTruthy();
    expect(r.unit).toBe(factor.unit);
    expect(OPS).toContain(r.op);
    if (r.op === 'between') expect(r.value[0]).toBeLessThan(r.value[1]);
    else if (r.op === 'in') expect(r.value.every((s) => ['kharif', 'rabi', 'zaid'].includes(s))).toBe(true);
    else expect(Number.isFinite(r.value)).toBe(true);
    const weather = !r.factor.startsWith('soil') && r.factor !== 'season';
    if (weather) expect(r.window_days).toBeGreaterThanOrEqual(1);
    if (weather) expect(r.window_days).toBeLessThanOrEqual(14); // the snapshot holds 14 days before the reference date
    else expect(r.window_days).toBeNull();
    if (r.factor === 'wetDays') expect(r.hours).toBeGreaterThan(0);
    expect(['favourable', 'unfavourable']).toContain(r.role);
    expect(r.weight).toBeGreaterThan(0);
    expect(c.sources.map((s) => s.id)).toContain(r.source_id);
  });

  test('rule ids are unique', () => {
    const ids = rules.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('published models are reused, not re-implemented', () => {
    const byModel = Object.fromEntries(kb.classes.filter((c) => c.model_ref).map((c) => [`${c.crop}/${c.class}`, c]));
    expect(Object.keys(byModel).sort()).toEqual(['potato/Late_blight', 'rice/Blast']);
    for (const c of Object.values(byModel)) expect(c.rules).toEqual([]);
  });

  test('nutrient rules read only the farmer\'s Soil Health Card, never modelled SoilGrids N/OC', () => {
    for (const [, r] of rules) expect(['soil.nitrogen', 'soil.soc']).not.toContain(r.factor);
  });

  test('every month has a season from the cited calendar', () => {
    for (let m = 1; m <= 12; m++) expect(kb.seasons.months[m].length).toBeGreaterThan(0);
    expect(kb.seasons.source.url).toMatch(/^https:/);
  });
});

describe('rules review CSV (npm run rules-review)', () => {
  test('docs/RULES_REVIEW.csv is up to date', () => {
    expect(fs.readFileSync(CSV_PATH, 'utf8')).toBe(toCsv(reviewRows()));
  });

  test('lists every rule and every non-healthy class without rules', () => {
    const rows = reviewRows();
    const empty = kb.classes.filter((c) => c.cause_type !== 'healthy' && !c.rules.length).length;
    expect(rows).toHaveLength(rules.length + empty);
    expect(rows.find((r) => r.row_id === 'rice.Bacterialblight.1').rule).toBe('mean daily temperature between 25–34 °C, last 7 days');
  });

  test('a filled-in CSV round-trips through Excel-style quoting', () => {
    const rows = reviewRows().slice(0, 2).map((r) => ({ ...r, reviewer: 'Dr "A", KVK', verdict: 'ok', notes: 'line1\nline2' }));
    const back = parseCsv(toCsv(rows));
    expect(back[0].reviewer).toBe('Dr "A", KVK');
    expect(back[1].notes).toBe('line1\nline2');
    expect(back[0].row_id).toBe(rows[0].row_id);
  });

  test('apply: ok, change (number, range, season list), reject; class becomes reviewed only when complete', () => {
    const k = clone();
    applyReview(k, [
      { row_id: 'rice.Bacterialblight.1', reviewer: 'R', verdict: 'change', corrected_value: '24-33' },
      { row_id: 'rice.Bacterialblight.2', reviewer: 'R', verdict: 'OK' },
      { row_id: 'groundnut.Leaf_Spot.1', reviewer: 'R', verdict: 'change', corrected_value: '31' },
      { row_id: 'blackgram.Yellow_Mosaic.1', reviewer: 'R', verdict: 'change', corrected_value: 'zaid; kharif' },
      { row_id: 'potato.Early_blight.1', reviewer: 'R', verdict: 'reject', notes: 'not for Indian plains' },
      { row_id: 'rice.Tungro.none', reviewer: 'R', verdict: 'ok' },
      { row_id: 'maize.Blight.1', reviewer: '', verdict: '' }, // untouched
    ], '2026-10-01');
    const get = (crop, cls) => k.classes.find((c) => c.crop === crop && c.class === cls);
    expect(get('rice', 'Bacterialblight').rules[0].value).toEqual([24, 33]);
    expect(get('rice', 'Bacterialblight').review_status).toBe('reviewed');
    expect(get('rice', 'Bacterialblight').rules[0].reviewed_by).toEqual({ reviewer: 'R', verdict: 'change', date: '2026-10-01' });
    expect(get('groundnut', 'Leaf_Spot').rules[0].value).toBe(31);
    expect(get('groundnut', 'Leaf_Spot').review_status).toBe('draft'); // its wetness rule is still open
    expect(get('blackgram', 'Yellow_Mosaic').rules[0].value).toEqual(['zaid', 'kharif']);
    expect(get('potato', 'Early_blight').rules).toEqual([]);
    expect(get('potato', 'Early_blight').no_rule_reason).toBe('Rule rejected by the reviewer: not for Indian plains');
    expect(get('rice', 'Tungro').review_status).toBe('reviewed');
    expect(get('maize', 'Blight').review_status).toBe('draft');
    // reviewed rows drop out of the next CSV
    const next = reviewRows(k).map((r) => r.row_id);
    expect(next).not.toContain('rice.Bacterialblight.1');
    expect(next).not.toContain('rice.Tungro.none');
    expect(next).toContain('groundnut.Leaf_Spot.2');
  });

  test('apply refuses bad input instead of guessing', () => {
    expect(() => applyReview(clone(), [{ row_id: 'rice.Bacterialblight.1', reviewer: 'R', verdict: 'maybe' }])).toThrow(/verdict/);
    expect(() => applyReview(clone(), [{ row_id: 'rice.Bacterialblight.1', reviewer: '', verdict: 'ok' }])).toThrow(/reviewer/);
    expect(() => applyReview(clone(), [{ row_id: 'rice.Bacterialblight.1', reviewer: 'R', verdict: 'change', corrected_value: 'warm' }])).toThrow(/range/);
    expect(() => applyReview(clone(), [{ row_id: 'rice.Nope.1', reviewer: 'R', verdict: 'ok' }])).toThrow(/unknown/);
    expect(() => applyReview(clone(), [{ row_id: 'rice.Tungro.none', reviewer: 'R', verdict: 'change', corrected_value: '1' }])).toThrow(/only be ok or reject/);
  });

  test('rule text names wetness hours', () => {
    const r = kb.classes.find((c) => c.class === 'WheatBlast').rules[1];
    expect(ruleText(r, kb.factors)).toBe('days with >= 12 h at RH >= 90% >= 1 days, last 7 days');
  });
});
