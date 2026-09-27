// Environment fit: does the stored context snapshot match the conditions the literature links to a disease?
// Pure functions, no I/O. Rules and scoring are documented in docs/DISEASE_RULES.md; the snapshot in
// docs/CONTEXT_LAYER.md. This only EXPLAINS a diagnosis; it never changes one (fusion.js is offline only).
import fs from 'node:fs';

export const KB = JSON.parse(fs.readFileSync(new URL('../knowledge/disease_rules.json', import.meta.url), 'utf8'));

export const LEVELS = ['favourable', 'neutral', 'unfavourable', 'unknown'];
export const FAVOURABLE_AT = 2 / 3; // score >= two thirds of the checked weight: favourable
export const UNFAVOURABLE_AT = 1 / 3; // score <= one third: unfavourable
const EPS = 1e-9; // so that exactly 2/3 and 1/3 land on the boundary despite floating point
export const MIN_COVERAGE = 0.7; // a weather factor needs data on >= 70% of its window's days
export const MAX_MISSING_WEIGHT = 0.5; // missing rules carrying >= half the weight: unknown
const MODEL_LEVEL = { high: ['favourable', 1], medium: ['neutral', 0.5], low: ['unfavourable', 0] };
const SOIL_TEST = 'soilTest.';

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const round = (x, digits = 1) => (x == null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

// the N days ending on the reference day
export function windowDays(snapshot, n) {
  const ref = snapshot.reference.date;
  const from = addDays(ref, -(n - 1));
  return (snapshot.weather?.days ?? []).filter((d) => d.date >= from && d.date <= ref);
}

const covered = (values, n) => values.length >= Math.ceil(MIN_COVERAGE * n);

// -> { value, from } or { missing: reason code } (codes, so the app can say it in the user's language)
export function factorValue(rule, snapshot, soilTest) {
  const f = rule.factor;
  if (f.startsWith(SOIL_TEST)) {
    const v = soilTest?.[f.slice(SOIL_TEST.length)];
    return v == null ? { missing: 'needs_soil_test' } : { value: v, from: 'soil_test' };
  }
  if (f === 'soil.ph') {
    if (soilTest?.ph != null) return { value: soilTest.ph, from: 'soil_test' };
    const v = snapshot.soil?.topsoil0to30?.phH2O;
    return v == null ? { missing: 'no_soil_data' } : { value: v, from: 'soilgrids' };
  }
  if (f === 'season') {
    const v = snapshot.season?.names;
    return v?.length ? { value: v, from: 'season' } : { missing: 'no_season' };
  }
  const days = windowDays(snapshot, rule.window_days);
  const pick = { tmean: 'tmean', tmin: 'tmin', tmeanMin: 'tmean', rhMean: 'rhMean', wetDays: 'hoursRh90' }[f];
  if (!pick) return { missing: 'unknown_factor' };
  const vals = days.map((d) => d[pick]).filter((v) => v != null);
  if (!covered(vals, rule.window_days)) {
    return { missing: f === 'wetDays' && days.length && vals.length === 0
      ? 'needs_hourly_humidity' : 'too_few_days' };
  }
  const value = f === 'tmeanMin' ? Math.min(...vals)
    : f === 'wetDays' ? vals.filter((h) => h >= rule.hours).length
      : mean(vals);
  return { value: round(value), from: 'weather', days: vals.length };
}

export function holds(op, actual, threshold) {
  switch (op) {
    case 'lt': return actual < threshold;
    case 'le': return actual <= threshold;
    case 'gt': return actual > threshold;
    case 'ge': return actual >= threshold;
    case 'between': return actual >= threshold[0] && actual <= threshold[1];
    case 'in': return [].concat(actual).some((a) => threshold.includes(a));
    default: throw new Error(`unknown operator ${op}`);
  }
}

// one rule against the snapshot: status met / not_met / missing, with the numbers to show
export function evaluateRule(rule, snapshot, soilTest, entry, factors = KB.factors) {
  const src = entry.sources.find((s) => s.id === rule.source_id);
  const base = {
    ruleId: rule.id, factor: rule.factor, label: factors[rule.factor]?.label ?? rule.factor, op: rule.op,
    threshold: rule.value, unit: rule.unit, windowDays: rule.window_days, hours: rule.hours ?? null,
    role: rule.role, weight: rule.weight, reading: rule.reading ?? null,
    source: src ? { id: src.id, title: src.title, url: src.url } : null,
  };
  const v = factorValue(rule, snapshot, soilTest);
  if (v.missing) return { ...base, status: 'missing', actual: null, from: null, reason: v.missing };
  return { ...base, status: holds(rule.op, v.value, rule.value) ? 'met' : 'not_met', actual: v.value, from: v.from };
}

const result = (level, score, items, extra = {}) => ({
  level, score: score == null ? null : round(score, 2),
  // "matched" = the item supports the disease (a favourable condition present, or an unfavourable one absent)
  matched: items.filter((i) => i.status !== 'missing' && (i.status === 'met') === (i.role === 'favourable')),
  unmatched: items.filter((i) => i.status !== 'missing' && (i.status === 'met') !== (i.role === 'favourable')),
  missing: items.filter((i) => i.status === 'missing'),
  ...extra,
});

// fit(classEntry, snapshot, soilTest?) -> { level, score 0..1, matched[], unmatched[], missing[], reason, draft }
export function fit(entry, snapshot, soilTest = null, factors = KB.factors) {
  const draft = entry.review_status !== 'reviewed';
  if (entry.cause_type === 'healthy') return result('unknown', null, [], { reason: 'healthy', draft: false });
  if (entry.model_ref) {
    const m = snapshot.riskModel;
    const [level, score] = MODEL_LEVEL[m?.level] ?? ['unknown', null];
    return result(level, score, [], { reason: level === 'unknown' ? (m?.reason ?? 'model_unavailable') : null,
      model: m ? { key: entry.model_ref, name: m.name, level: m.level, date: m.date, conditions: m.conditions } : null, draft });
  }
  if (!entry.rules.length) return result('unknown', null, [], { reason: 'no_rules', noRuleReason: entry.no_rule_reason, draft });

  const items = entry.rules.map((r) => evaluateRule(r, snapshot, soilTest, entry, factors));
  const total = items.reduce((s, i) => s + i.weight, 0);
  const checked = items.filter((i) => i.status !== 'missing');
  const checkedWeight = checked.reduce((s, i) => s + i.weight, 0);
  const supports = (i) => (i.status === 'met') === (i.role === 'favourable');

  if (entry.combine === 'any') {
    // one deficient nutrient is enough; "not deficient" needs at least half of the rules checked
    if (checked.some((i) => i.status === 'met' && i.role === 'favourable')) return result('favourable', 1, items, { reason: null, draft });
    if (checkedWeight >= MAX_MISSING_WEIGHT * total && checked.length) return result('unfavourable', 0, items, { reason: null, draft });
    return result('unknown', null, items, { reason: 'missing_data', draft });
  }
  if (!checked.length || total - checkedWeight >= MAX_MISSING_WEIGHT * total) {
    return result('unknown', null, items, { reason: 'missing_data', draft });
  }
  const score = checked.filter(supports).reduce((s, i) => s + i.weight, 0) / checkedWeight;
  const level = score >= FAVOURABLE_AT - EPS ? 'favourable' : score <= UNFAVOURABLE_AT + EPS ? 'unfavourable' : 'neutral';
  return result(level, score, items, { reason: null, draft });
}

export const classEntry = (crop, cls, kb = KB) => kb.classes.find((c) => c.crop === crop && c.class === cls) ?? null;

// The diagnosed class and each other top-3 class, as the API returns them
export function contextFit({ crop, disease, top3 }, snapshot, soilTest = null, kb = KB) {
  const one = (cls) => {
    const entry = classEntry(crop, cls, kb);
    return entry ? { class: cls, ...fit(entry, snapshot, soilTest, kb.factors) } : { class: cls, level: 'unknown', reason: 'unknown_class' };
  };
  return {
    diagnosed: disease ? one(disease) : null,
    alternatives: (top3 ?? []).filter((t) => t.disease !== disease).map((t) => ({ ...one(t.disease), probability: t.probability })),
  };
}
