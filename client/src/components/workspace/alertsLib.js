// Pure helpers for the weather alerts (server/controllers/fieldController.js, docs/FIELD_ALERTS.md).
import { cropName } from '../../locales/terms';
import { locOf } from './parts';

export const RANK = { info: 0, watch: 1, warn: 2, urgent: 3 };
export const HAZARD_ICON = { frost: 'frost', heat: 'sun', heatwave: 'sun', rain_harvest: 'harvest', rain_heavy: 'rain', rain_spray: 'rain', flood_river: 'rain', dry_spell: 'sun', disease_near: 'sprout', fire_near: 'fire' };
// official alerts (NDMA SACHET, IMD) have a hazard family instead of one of our rules' hazards
export const FAMILY_ICON = { rain: 'rain', storm: 'rain', wind: 'bell', heat: 'sun', cold: 'frost', fog: 'cloudsun', flood: 'rain', other: 'bell' };
export const iconOf = (a) => (a.origin === 'official' ? FAMILY_ICON[a.family] ?? 'bell' : HAZARD_ICON[a.hazard]);

// every alert that applies to a field: our own (only when its weather loaded) and the official ones (which do not need it)
const alertsOf = (f) => [...(f.alerts ?? []), ...(f.official ?? [])]; // a field without weather has only the river alert, if any
export const STAGES = ['sowing', 'vegetative', 'flowering', 'grain_fill', 'harvest_ready'];
export const MAX_FIELDS = 3; // server/models/Field.js

// English crop names are stored lower-case (Hindi has no case); a field shows its own name, else its crop
export const cropLabel = (crop, lang) => { const n = cropName(crop, lang); return n.charAt(0).toUpperCase() + n.slice(1); };
export const fieldName = (f, lang) => f.name || cropLabel(f.crop, lang);

// every alert of every field, worst first; at the same level an official one goes first, then the soonest; each carries its field
export const collect = (fields) => fields
  .flatMap((f) => alertsOf(f).map((a) => ({ ...a, field: f })))
  .sort((a, b) => RANK[b.level] - RANK[a.level] || (b.origin === 'official') - (a.origin === 'official') || a.date.localeCompare(b.date));

// counts for the Overview switch: alerts by level (ours and official), fields whose weather loaded, fields that cannot be checked
export function summarize(fields) {
  const ok = fields.filter((f) => f.status === 'ok');
  const all = fields.flatMap(alertsOf);
  const count = (level) => all.filter((a) => a.level === level).length;
  return { urgent: count('urgent'), warn: count('warn'), watch: count('watch'), info: count('info'), unavailable: fields.length - ok.length, ok: ok.length, total: fields.length };
}

// the official feeds that are late or down (the server says which, from the last good fetch): null when all is well.
// `at` is when the oldest of them was last fetched, or null when it never was.
export function feedNotice(sources = []) {
  const late = sources.filter((s) => s.state === 'delayed' || s.state === 'down');
  if (!late.length) return null;
  return { down: late.some((s) => s.state === 'down'), at: late.some((s) => !s.fetchedAt) ? null : late.map((s) => s.fetchedAt).sort()[0] };
}

// ---- "Did this help?" answers are remembered on this device too, so the question is not asked twice about one alert
const HELP_KEY = 'alertHelp';
export const readHelp = () => {
  try { return JSON.parse(localStorage.getItem(HELP_KEY)) ?? {}; } catch { return {}; }
};
export const writeHelp = (map) => {
  try { localStorage.setItem(HELP_KEY, JSON.stringify(map)); } catch { /* private mode: not remembered */ }
};

// ---- "mark as done" is remembered on this device only; the id holds the date, so it is never reused ----
const DONE_KEY = 'alertDone';
export const alertKey = (a) => `${a.field._id}|${a.id}`;
export const readDone = () => {
  try { return JSON.parse(localStorage.getItem(DONE_KEY)) ?? {}; } catch { return {}; }
};
export const writeDone = (map) => {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(map)); } catch { /* private mode: not remembered */ }
};

// ---- dates: the server sends local dates and local hours ("2027-02-24", "2027-02-24T04:00") ----
const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / 864e5);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
const asDate = (local) => new Date(Number(local.slice(0, 4)), Number(local.slice(5, 7)) - 1, Number(local.slice(8, 10)), Number(local.slice(11, 13) || 0));

export const dayLabel = (date, lang) => asDate(`${date}T12:00`).toLocaleDateString(locOf(lang), { weekday: 'short', day: 'numeric', month: 'short' });
export const dayMonth = (date, lang) => asDate(`${date}T12:00`).toLocaleDateString(locOf(lang), { day: 'numeric', month: 'short' });
export const weekday = (date, lang) => asDate(`${date}T12:00`).toLocaleDateString(locOf(lang), { weekday: 'short' });
// IMD writes districts in capitals ("SOUTH 24 PARGANAS")
export const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, c) => sep + c.toUpperCase());

// "25 Oct, 11:44 am": when something was issued, from an ISO time
export const stamp = (iso, lang) => new Date(iso).toLocaleString(locOf(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const hourLabel = (local, lang) => asDate(local).toLocaleTimeString(locOf(lang), { hour: 'numeric' });

// where a local time falls on the 72-hour strip: 4 parts per day, so 0 to 12 (fractional)
export const stripPos = (today, local) => daysBetween(today, local.slice(0, 10)) * 4 + Number(local.slice(11, 13)) / 6;

// first part and number of parts an alert covers on the strip
export function stripSpan(today, alert) {
  const start = Math.max(0, Math.floor(stripPos(today, alert.from)));
  const end = Math.min(12, Math.max(start + 1, Math.ceil(stripPos(today, alert.to))));
  return start >= 12 ? null : { start, span: end - start };
}

// the bar chart in the main alert: values of the rule's metric over the days ahead, with the lines of its levels
export function chartScale(values) {
  const { metric, series, levels } = values;
  const top = Math.max(...series.map((s) => s.value));
  if (metric === 'tmin') return { lo: 0, hi: Math.max(8, Math.ceil(top) + 1) };
  if (metric === 'tmax') return { lo: 20, hi: Math.max(42, Math.ceil(top) + 1) };
  return { lo: 0, hi: Math.max(levels.warn ?? levels.watch ?? levels.info, top) * 1.15 };
}
export const pct = (v, { lo, hi }) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

// 'today' | 'tomorrow' | a weekday + date
export const dueKey = (alert) => (alert.offset === 0 ? 'today' : alert.offset === 1 ? 'tomorrow' : null);
