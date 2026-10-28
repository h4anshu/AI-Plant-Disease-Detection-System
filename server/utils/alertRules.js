import { createRequire } from "node:module";
// Weather alert rules for a saved field (docs/FIELD_ALERTS.md has every threshold and its source).
// Pure functions over the hourly local-time series of services/openMeteo.js getWeather:
// { time: ['YYYY-MM-DDTHH:00', ...], temp: [°C], rain: [mm], ... }. Nothing here fetches anything and the
// output holds no coordinates: the client writes the words (locales: alerts.rules.<RULE-ID>).
// Every rule is a DRAFT until an agronomist signs it off (docs/FIELD_ALERTS.md, "Review"); thresholds marked
// "ours" have no published source and are the first thing the reviewer should look at.

export const STAGES = ['sowing', 'vegetative', 'flowering', 'grain_fill', 'harvest_ready'];
// Rules whose every row in docs/ALERT_REVIEW.csv has an "ok" from the reviewer (npm run alerts-review -- --apply, server/data/alert_review.json)
const REVIEWED = new Set(createRequire(import.meta.url)('../data/alert_review.json').reviewed);
export const reviewStatusOf = (ruleId) => (REVIEWED.has(ruleId) ? 'reviewed' : 'draft');
export const MAX_ALERTS = 3;
const LEAD_DAYS = 3; // alerts for today and the next two local days; the 4th day only completes the night series

const RANK = { info: 0, watch: 1, warn: 2 };

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const r1 = (x) => Math.round(x * 10) / 10;
const dateOf = (t) => t.slice(0, 10);
const hourOf = (t) => Number(t.slice(11, 13));

// "YYYY-MM-DDTHH" of the current local hour; hours before it are history for alert purposes
export const localHour = (utcOffsetSeconds, now = new Date()) =>
  new Date(now.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 13);

// Fractional local hour of the day, 0 to 24
export const localHourFraction = (utcOffsetSeconds, now = new Date()) => {
  const d = new Date(now.getTime() + utcOffsetSeconds * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

// Per local date from `today`: Tmin, Tmax, rain over the hours that have not passed yet. A date with no
// temperature left is skipped (the end of the series), never guessed.
export function futureDays(w, nowHour, today, count) {
  const dates = Array.from({ length: count }, (_, i) => addDays(today, i));
  return dates.map((date, offset) => {
    const hours = [];
    w.time.forEach((t, i) => {
      if (dateOf(t) === date && t.slice(0, 13) >= nowHour && w.temp[i] != null) hours.push({ h: hourOf(t), temp: w.temp[i], rain: w.rain?.[i] ?? 0 });
    });
    if (!hours.length) return null;
    return {
      date, offset, hours,
      tmin: Math.min(...hours.map((x) => x.temp)),
      tmax: Math.max(...hours.map((x) => x.temp)),
      rain: hours.reduce((s, x) => s + x.rain, 0),
    };
  }).filter(Boolean);
}

const hhmm = (date, h) => `${date}T${String(h).padStart(2, '0')}:00`;
const endOf = (date, h) => (h >= 23 ? `${addDays(date, 1)}T00:00` : hhmm(date, h + 1));

// first and last hour satisfying `pred`, as local times
function windowOf(day, pred) {
  const hit = day.hours.filter(pred);
  if (!hit.length) return { from: hhmm(day.date, day.hours[0].h), to: endOf(day.date, day.hours.at(-1).h) };
  return { from: hhmm(day.date, hit[0].h), to: endOf(day.date, hit.at(-1).h) };
}

// IMD's dry day: under 2.5 mm of rain in the local day (Mausam Sankalp counts runs of them at 7, 14 and 21 days)
export const DRY_DAY_MM = 2.5;
const RAINFED = ['rice', 'maize', 'groundnut', 'pigeonpea', 'blackgram']; // the kharif crops that depend on the monsoon; wheat, potato, apple, banana and cane are irrigated

const FROST_STAGES_WHEAT = ['flowering', 'grain_fill'];
const FROST_STAGES_POTATO = ['vegetative', 'flowering', 'grain_fill'];

// metric: which daily number the rule reads; levels: threshold per level (for the chart and the "why");
// test(day, days) -> level | null. `crops`/`stages` null = any.
export const RULES = [
  { id: 'FROST-WHEAT-1', hazard: 'frost', crops: ['wheat'], stages: FROST_STAGES_WHEAT, metric: 'tmin', below: true, levels: { warn: 2, watch: 4 },
    // 2 and 4 °C mirror IMD's cold-wave levels; damage data is US/Australian, to be confirmed for India
    test: (d) => (d.tmin <= 2 ? 'warn' : d.tmin <= 4 ? 'watch' : null) },
  { id: 'FROST-POTATO-1', hazard: 'frost', crops: ['potato'], stages: FROST_STAGES_POTATO, metric: 'tmin', below: true, levels: { warn: 2, watch: 4 },
    test: (d) => (d.tmin <= 2 ? 'warn' : d.tmin <= 4 ? 'watch' : null) }, // thresholds ours
  { id: 'HEAT-WHEAT-1', hazard: 'heat', crops: ['wheat'], stages: FROST_STAGES_WHEAT, metric: 'tmax', levels: { warn: 36, watch: 34 },
    // 34 °C: Lobell et al. 2012 (northern India); 36 °C on 2 days in a row is ours
    test: (d, days) => (d.tmax >= 36 && days.some((o) => Math.abs(o.offset - d.offset) === 1 && o.tmax >= 36) ? 'warn' : d.tmax >= 34 ? 'watch' : null) },
  { id: 'HEAT-RICE-1', hazard: 'heat', crops: ['rice'], stages: ['flowering'], metric: 'tmax', levels: { warn: 35, watch: 33 },
    test: (d) => (d.tmax >= 35 ? 'warn' : d.tmax >= 33 ? 'watch' : null) }, // pollen sterility above 33 °C
  { id: 'HEAT-ANY-1', hazard: 'heatwave', crops: null, stages: null, metric: 'tmax', levels: { watch: 40 },
    test: (d) => (d.tmax >= 40 ? 'watch' : null) }, // IMD heat wave in the plains (Tmax >= 40 °C); hills use 30 °C, not covered yet
  { id: 'RAIN-HARVEST-1', hazard: 'rain_harvest', crops: null, stages: ['harvest_ready'], metric: 'rain', levels: { warn: 30, watch: 10 },
    test: (d) => (d.rain >= 30 ? 'warn' : d.rain >= 10 ? 'watch' : null) }, // 10 and 30 mm ours
  { id: 'RAIN-HEAVY-1', hazard: 'rain_heavy', crops: null, stages: null, metric: 'rain', levels: { warn: 64.5, watch: 40 },
    test: (d) => (d.rain >= 64.5 ? 'warn' : d.rain >= 40 ? 'watch' : null) }, // 64.5 mm = IMD "heavy"; 40 mm ours
  // the run of dry days up to each day (see dryRuns); the crop-stage split is ours, the 7 and 14 days are IMD's counts
  { id: 'DRY-SPELL-1', hazard: 'dry_spell', crops: RAINFED, stages: ['sowing', 'flowering', 'grain_fill'], metric: 'dry', levels: { warn: 14, watch: 7 },
    test: (d) => (d.dry >= 14 ? 'warn' : d.dry >= 7 ? 'watch' : null) },
  { id: 'DRY-SPELL-2', hazard: 'dry_spell', crops: RAINFED, stages: ['vegetative'], metric: 'dry', levels: { watch: 14 },
    test: (d) => (d.dry >= 14 ? 'watch' : null) },
  { id: 'RAIN-SPRAY-1', hazard: 'rain_spray', crops: null, stages: ['vegetative', 'flowering', 'grain_fill'], metric: 'rain', levels: { info: 10 }, maxOffset: 1,
    test: (d) => (d.rain >= 10 ? 'info' : null) }, // 10 mm ours
];

const applies = (rule, field) =>
  (!rule.crops || rule.crops.includes(field.crop)) && (!rule.stages || rule.stages.includes(field.stage));

// A night low belongs to the date its early hours are on; a date with no night hours left is only a partial evening
const nightsAhead = (days) => {
  const nights = days.filter((d) => d.hours.some((x) => x.h < 6));
  return nights.length >= LEAD_DAYS ? nights.slice(0, LEAD_DAYS) : days.slice(0, LEAD_DAYS);
};

// Consecutive dry days up to and including each local date, counted over whole days (rain so far + forecast). A run that reaches the
// start of the data is a lower bound (we hold 14 past days), which is the safe side for "how long has it been dry".
export function dryRuns(w) {
  const total = new Map();
  w.time.forEach((t, i) => { if (w.rain?.[i] != null) total.set(dateOf(t), (total.get(dateOf(t)) ?? 0) + w.rain[i]); });
  const runs = new Map();
  let run = 0;
  for (const date of [...total.keys()].sort()) {
    run = total.get(date) < DRY_DAY_MM ? run + 1 : 0;
    runs.set(date, run);
  }
  return runs;
}

// One alert per rule: its worst day (earliest on a tie). The third day ahead is a long lead, so it never says "warning".
function evaluateRule(rule, field, days) {
  const ahead = rule.metric === 'tmin' ? nightsAhead(days) : days.slice(0, LEAD_DAYS);
  let best = null;
  ahead.forEach((d, i) => {
    if (rule.maxOffset != null && d.offset > rule.maxOffset) return;
    let level = rule.test(d, days);
    if (!level) return;
    if (i === LEAD_DAYS - 1 && level === 'warn') level = 'watch';
    if (!best || RANK[level] > RANK[best.level]) best = { level, day: d };
  });
  if (!best) return null;
  const { level, day } = best;
  const pred = rule.metric === 'dry' ? () => true : rule.metric === 'rain' ? (x) => x.rain >= 0.1 : rule.below ? (x) => x.temp <= rule.levels.watch : (x) => x.temp >= rule.levels.watch;
  return {
    id: `${rule.id}|${day.date}`, rule: rule.id, hazard: rule.hazard, level,
    date: day.date, offset: day.offset, ...windowOf(day, pred),
    values: { metric: rule.metric, value: r1(day[rule.metric]), threshold: rule.levels[level], levels: rule.levels,
      series: ahead.map((d) => ({ date: d.date, value: r1(d[rule.metric]) })) },
    stage: field.stage, crop: field.crop,
    confidence: day.offset <= 1 ? 'medium' : 'low', // forecasts are least certain at the long lead
    reviewStatus: reviewStatusOf(rule.id),
  };
}

const RAIN_GROUP = ['rain_harvest', 'rain_heavy'];

// The most useful MAX_ALERTS alerts for a field. Of two rain rules on one day only the stronger shows (the more
// specific one on a tie), and the "postpone spraying" hint drops out when a stronger rain alert exists that day.
export function evaluate(field, w, now = new Date()) {
  const nowHour = localHour(w.utcOffsetSeconds, now);
  const days = futureDays(w, nowHour, nowHour.slice(0, 10), LEAD_DAYS + 1);
  if (!days.length) throw new Error('no forecast hours'); // never an empty list that reads like good news
  const runs = dryRuns(w);
  days.forEach((d) => { d.dry = runs.get(d.date) ?? 0; });
  const order = new Map(RULES.map((r, i) => [r.id, i]));
  const all = RULES.filter((r) => applies(r, field)).map((r) => evaluateRule(r, field, days)).filter(Boolean);
  const stronger = (a, b) => RANK[a.level] - RANK[b.level] || order.get(b.rule) - order.get(a.rule); // > 0: a wins
  const rainDay = new Map();
  for (const a of all.filter((x) => RAIN_GROUP.includes(x.hazard))) {
    const cur = rainDay.get(a.date);
    if (!cur || stronger(a, cur) > 0) rainDay.set(a.date, a);
  }
  const alerts = all.filter((a) => (RAIN_GROUP.includes(a.hazard) ? rainDay.get(a.date) === a : a.hazard !== 'rain_spray' || !rainDay.has(a.date)));
  return alerts
    .sort((a, b) => RANK[b.level] - RANK[a.level] || a.date.localeCompare(b.date) || order.get(a.rule) - order.get(b.rule))
    .slice(0, MAX_ALERTS);
}

// ---- the 72-hour strip: 3 local days x 4 parts of the day ------------------------------------------------
// Night 0-6 shows its lowest temperature, noon 12-18 its highest, morning and evening their mean: the
// numbers a farmer looks for (the cold of the night, the heat of the afternoon).
export function horizon(w, today, nowHourFraction) {
  const days = Array.from({ length: 3 }, (_, i) => addDays(today, i));
  const out = days.map((date, di) => ({
    date,
    slots: [0, 1, 2, 3].map((s) => {
      const from = s * 6;
      const idx = w.time.map((t, i) => i).filter((i) => dateOf(w.time[i]) === date && hourOf(w.time[i]) >= from && hourOf(w.time[i]) < from + 6 && w.temp[i] != null);
      const temps = idx.map((i) => w.temp[i]);
      const t = !temps.length ? null : s === 0 ? Math.min(...temps) : s === 2 ? Math.max(...temps) : temps.reduce((a, b) => a + b, 0) / temps.length;
      const rain = idx.reduce((sum, i) => sum + (w.rain?.[i] ?? 0), 0);
      return { t: t == null ? null : r1(t), rain: r1(rain), past: di === 0 && from + 6 <= nowHourFraction };
    }),
  }));
  return { days: out, now: r1(nowHourFraction / 6) };
}

// A few plain numbers for the "field conditions" card: rain of the last 7 local days, the coldest night ahead
export function conditions(w, today, nowHour) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
  const have = new Set(w.time.map(dateOf));
  const rain7 = dates.every((d) => have.has(d))
    ? r1(w.time.reduce((s, t, i) => (dates.includes(dateOf(t)) ? s + (w.rain?.[i] ?? 0) : s), 0))
    : null;
  const nights = nightsAhead(futureDays(w, nowHour, today, LEAD_DAYS + 1));
  const coldest = nights.length ? nights.reduce((a, b) => (b.tmin < a.tmin ? b : a)) : null;
  return { rain7, coldest: coldest ? { t: r1(coldest.tmin), date: coldest.date } : null };
}
