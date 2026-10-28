// Backtest of the weather-alert rules on past weather (docs/FIELD_ALERTS.md, "Evaluation").
//   cd server && npm run alerts-backtest                      -> writes docs/ALERT_BACKTEST.md for the built-in runs
//   cd server && npm run alerts-backtest -- --events <file>   -> also scores the alerts against a list of real events
//   --events: a CSV with the columns label,date,hazard   (label = a run's label below, hazard = frost, heat, heatwave, rain_heavy, ...)
// How it works: Open-Meteo's archive (ERA5 reanalysis) gives the hourly weather that really happened; for every day D of a season the
// rules are run exactly as the server runs them (14 past days + the days ahead as the "forecast"), with the real weather of those days
// standing in for the forecast. That is a PERFECT forecast: it measures how often each rule would speak, how many alerts a farmer
// would get per week and how early the first one could appear, not how good a real forecast is. ERA5 is 0.25 degrees, so local
// extremes (a cold hollow, a thunderstorm cell) are smoothed. Only the rules of server/utils/alertRules.js are replayed (not the
// official warnings, the river, fire or disease reports, which cannot be replayed from weather).
import fs from 'node:fs';
import axios from 'axios';
import { pathToFileURL } from 'node:url';
import { evaluate } from '../utils/alertRules.js';
import { parseCsv } from './rules_review.js';

const ROOT = new URL('../../', import.meta.url);
const DOC = new URL('docs/ALERT_BACKTEST.md', ROOT);
const DAY = 864e5;
const LEVELS = ['info', 'watch', 'warn'];

// Places are city centres, not anybody's field; stages are held fixed through the season (a real field moves through them).
export const RUNS = [
  { label: 'Ludhiana wheat flowering, Feb-Mar 2026', lat: 30.90, lon: 75.85, crop: 'wheat', stage: 'flowering', from: '2026-02-01', to: '2026-03-31' },
  { label: 'Ludhiana wheat grain filling, Mar-Apr 2026', lat: 30.90, lon: 75.85, crop: 'wheat', stage: 'grain_fill', from: '2026-03-01', to: '2026-04-20' },
  { label: 'Shimla potato growing, Dec 2025-Feb 2026', lat: 31.10, lon: 77.17, crop: 'potato', stage: 'vegetative', from: '2025-12-01', to: '2026-02-28' },
  { label: 'Cuttack rice flowering, mid Sep-Oct 2025', lat: 20.46, lon: 85.88, crop: 'rice', stage: 'flowering', from: '2025-09-15', to: '2025-10-31' },
  { label: 'Cuttack rice growing, Jul-Aug 2025', lat: 20.46, lon: 85.88, crop: 'rice', stage: 'vegetative', from: '2025-07-01', to: '2025-08-31' },
  { label: 'Jaipur maize growing, Jul-mid Sep 2025', lat: 26.92, lon: 75.79, crop: 'maize', stage: 'vegetative', from: '2025-07-01', to: '2025-09-15' },
];

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const span = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export async function fetchArchive({ lat, lon, from, to }) {
  const { data } = await axios.get(process.env.OPEN_METEO_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive', {
    params: { latitude: lat, longitude: lon, start_date: addDays(from, -14), end_date: addDays(to, 4), hourly: 'temperature_2m,relative_humidity_2m,precipitation', timezone: 'auto' }, timeout: 60000 });
  if (!data?.hourly?.time) throw new Error('archive answer has no hourly data');
  return { time: data.hourly.time, temp: data.hourly.temperature_2m, rh: data.hourly.relative_humidity_2m, rain: data.hourly.precipitation, utcOffsetSeconds: data.utc_offset_seconds, timezone: data.timezone };
}

// Pure: the hours of weather `w` from date a to date b (inclusive)
const slice = (w, a, b) => {
  const idx = w.time.map((t, i) => i).filter((i) => w.time[i].slice(0, 10) >= a && w.time[i].slice(0, 10) <= b);
  return { ...w, time: idx.map((i) => w.time[i]), temp: idx.map((i) => w.temp[i]), rh: idx.map((i) => w.rh?.[i]), rain: idx.map((i) => w.rain[i]) };
};

// Every day D in [from, to]: what the server would have said at 11:30 India time that day. -> [{ id, rule, hazard, date, firstSeen, level, maxLevel, daysSeen }]
// by alert id ("RULE|date"): an alert that shows on several days (a frost seen 2 days ahead, then 1 day, then tonight) is one alert.
export function replay(field, w, from, to) {
  const found = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const now = new Date(Date.parse(`${d}T06:00:00Z`) - w.utcOffsetSeconds * 1000);
    for (const a of evaluate(field, slice(w, addDays(d, -14), addDays(d, 4)), now)) {
      const cur = found.get(a.id);
      if (!cur) found.set(a.id, { id: a.id, rule: a.rule, hazard: a.hazard, date: a.date, firstSeen: d, firstLevel: a.level, maxLevel: a.level, daysSeen: 1 });
      else { cur.daysSeen += 1; if (LEVELS.indexOf(a.level) > LEVELS.indexOf(cur.maxLevel)) cur.maxLevel = a.level; }
    }
  }
  return [...found.values()].sort((x, y) => x.date.localeCompare(y.date));
}

// Consecutive dates of one rule (a cold week) are one episode: what a single message about it would cover
export function episodes(alerts) {
  let n = 0;
  let last = null;
  for (const a of [...alerts].sort((x, y) => x.rule.localeCompare(y.rule) || x.date.localeCompare(y.date))) {
    if (!last || last.rule !== a.rule || span(last.date, a.date) > 1) n += 1;
    last = a;
  }
  return n;
}

// per rule: unique alerts by their highest level, and alerts per week; plus the same for all rules together
export function summarize(alerts, days) {
  const weeks = days / 7;
  const rows = {};
  for (const a of alerts) {
    const r = (rows[a.rule] ??= { rule: a.rule, info: 0, watch: 0, warn: 0, total: 0, leads: [] });
    r[a.maxLevel] += 1; r.total += 1; r.leads.push(span(a.firstSeen, a.date));
  }
  const loud = alerts.filter((a) => a.maxLevel !== 'info'); // a tip is not something that would ever be pushed
  return { rows: Object.values(rows).sort((x, y) => y.total - x.total), perWeek: alerts.length / weeks, loudPerWeek: loud.length / weeks, episodes: episodes(loud), episodesPerWeek: episodes(loud) / weeks,
    maxLead: Math.max(0, ...alerts.map((a) => span(a.firstSeen, a.date))) };
}

// events: [{ date, hazard }]. An alert of that hazard at watch level or above, dated within a day of the event, is a hit; its lead time is the
// days between its first appearance and the event. POD = hits / events. False alarm ratio = loud alerts with no event near them / loud alerts.
export function score(alerts, events) {
  const loud = alerts.filter((a) => a.maxLevel !== 'info');
  const near = (a, e) => a.hazard === e.hazard && Math.abs(span(a.date, e.date)) <= 1;
  const hits = events.map((e) => ({ e, a: loud.find((a) => near(a, e)) }));
  const found = hits.filter((h) => h.a);
  const falseAlarms = loud.filter((a) => !events.some((e) => near(a, e)) && events.some((e) => e.hazard === a.hazard)); // judged only for hazards the event list covers
  const judged = loud.filter((a) => events.some((e) => e.hazard === a.hazard));
  return { events: events.length, hits: found.length, pod: events.length ? found.length / events.length : null,
    far: judged.length ? falseAlarms.length / judged.length : null, judged: judged.length, leads: found.map((h) => span(h.a.firstSeen, h.e.date)), missed: hits.filter((h) => !h.a).map((h) => h.e) };
}

const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
const one = (x) => (Math.round(x * 10) / 10).toString();

export function report(results, events) {
  const out = [
    '# Alert rules replayed on past weather',
    '',
    `Generated by \`npm run alerts-backtest\` on ${new Date().toISOString().slice(0, 10)}. **Read the method first:** the weather that really happened (Open-Meteo archive, ERA5 reanalysis, 0.25 degrees) stands in for the forecast, so this is a *perfect forecast*. It shows how often each rule speaks and how many alerts a farmer would get; it says nothing about how good a real forecast is (real ones are worse, especially for rain and for the third day ahead). Local extremes are smoothed by ERA5. Places are city centres and the crop stage is held fixed through the season. Only the weather rules are replayed (not the official warnings, the river, fire or disease reports). The thresholds are still drafts: this is a check of noise, not a validation.`,
    '',
    'An "alert" is one rule on one date (a frost that shows 2 days ahead, then 1 day, then tonight is one alert). A "tip" is the lowest level; only watches and warnings are counted in the "per week" column that is compared with the target of at most 2 notifications per field per week.',
    '',
  ];
  for (const r of results) {
    const s = r.summary;
    out.push(`## ${r.run.label}`, '', `${r.days} days replayed. **${s.rows.reduce((n, x) => n + x.total, 0)} alerts, ${one(s.perWeek)} per week; watches and warnings ${one(s.loudPerWeek)} per week**${s.loudPerWeek > 2 ? ' (above the target of 2)' : ''}; with consecutive days of one rule counted as one episode: ${s.episodes} episodes, ${one(s.episodesPerWeek)} per week. Earliest an alert appeared: ${s.maxLead} days ahead.`, '');
    if (s.rows.length) {
      out.push('| Rule | Tip | Watch | Warning | Total | Median days ahead |', '|---|---|---|---|---|---|');
      for (const x of s.rows) { const l = [...x.leads].sort((a, b) => a - b); out.push(`| ${x.rule} | ${x.info} | ${x.watch} | ${x.warn} | ${x.total} | ${l[Math.floor(l.length / 2)]} |`); }
    } else out.push('No alert at all in this season.');
    if (r.score) {
      const c = r.score;
      out.push('', `Against ${c.events} listed events: **detected ${c.hits} (${pct(c.pod)})**, false-alarm ratio **${pct(c.far)}** of ${c.judged} watches and warnings of the hazards listed, lead times ${c.leads.length ? c.leads.join(', ') + ' days' : 'n/a'}.${c.missed.length ? ` Missed: ${c.missed.map((m) => `${m.date} ${m.hazard}`).join('; ')}.` : ''}`);
    }
    out.push('');
  }
  if (!events) out.push('No list of real events was given, so detection and false-alarm rates are not computed. To compute them: collect dates of real frost, heat, heavy rain or dry-spell events (from IMD bulletins, news or farmers) into a CSV with the columns `label,date,hazard` and run `npm run alerts-backtest -- --events <file>`.', '');
  return `${out.join('\n')}\n`;
}

export const readEvents = (file) => parseCsv(fs.readFileSync(file, 'utf8')).filter((r) => r.date && r.hazard);

async function main() {
  const i = process.argv.indexOf('--events');
  const events = i > 0 ? readEvents(process.argv[i + 1]) : null;
  const results = [];
  for (const run of RUNS) {
    const w = await fetchArchive(run);
    const field = { crop: run.crop, stage: run.stage };
    const alerts = replay(field, w, run.from, run.to);
    const days = span(run.from, run.to) + 1;
    const mine = events?.filter((e) => e.label === run.label).map((e) => ({ date: e.date, hazard: e.hazard }));
    results.push({ run, days, alerts, summary: summarize(alerts, days), score: mine?.length ? score(alerts, mine) : null });
    console.log(`${run.label}: ${alerts.length} alerts`);
  }
  fs.writeFileSync(DOC, report(results, events));
  console.log('wrote docs/ALERT_BACKTEST.md');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
