import { createHash } from "node:crypto";
import { reviewStatusOf } from "../utils/alertRules.js";
import axios from "axios";
import { FloodClimate, FloodForecast } from "../models/Flood.js";
import { addDays, istDate } from "../utils/context.js";
import { snap } from "./openMeteo.js";
import { reserveUsage } from "./usage.js";

// The regional river signal (docs/FIELD_ALERTS.md, "Flood"). Open-Meteo's flood API (GloFAS) gives river discharge on a 5 km grid and
// snaps a point to "the largest river in the cell", which for Ludhiana is a 2 m³/s drain and not the Sutlej 11 km north. So the cell and
// its four neighbours 0.1° away are asked, the biggest river among them is used, and its forecast is compared with ITS OWN usual flows
// (the 1984-2022 reanalysis). It says "river flow in your area is unusually high", never that a field will flood. No forecast skill for
// Indian basins is published, so every alert is low confidence and a draft.
const url = () => process.env.OPEN_METEO_FLOOD_URL || 'https://flood-api.open-meteo.com/v1/flood';
const SHIFT = 0.1;
const MIN_FLOW = 50;         // m³/s, the mean of the next days: below this there is no river worth a flood signal (a drain, a canal)
const MIN_CLIMATE_DAYS = 1000;
// Open-Meteo weighs a request by its locations and days, so the usual range is asked for ONE point (the river found in the forecast) and
// 17 years, not 5 points and 38: that costs about 450 calls once per river instead of 5,000, which would use the whole free hour
const CLIMATE_FROM = '2005-01-01';
const RETRY_AFTER_MS = 10 * 60e3; // after a failure (429 included) the same question is not asked again for 10 minutes
const failedUntil = new Map();
const RISING = 1.05;         // the peak must be 5% above today's flow
const HORIZON_DAYS = 7;
const r = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 100) / 100);
const SIX_HOURS = 6 * 3600e3;

// the cell's own point and four neighbours 0.1° north, south, east and west; coordinates are the snapped cell, never the field's point
export const cellPoints = (lat, lon) => {
  const [la, lo] = [snap(lat), snap(lon)];
  return [[0, 0], [SHIFT, 0], [-SHIFT, 0], [0, SHIFT], [0, -SHIFT]].map(([a, b]) => ({ lat: Number((la + a).toFixed(3)), lon: Number((lo + b).toFixed(3)) }));
};

// Open-Meteo's weighting as we understand it: locations x days / 14 (one call for 14 days of one place)
const weight = (points, params) => {
  const days = params.start_date ? Math.round((Date.parse(params.end_date) - Date.parse(params.start_date)) / 864e5) + 1 : (params.past_days ?? 0) + (params.forecast_days ?? 0);
  return Math.max(1, Math.ceil((points.length * days) / 14));
};

const ask = async (points, params) => {
  const { data } = await axios.get(url(), {
    params: { latitude: points.map((p) => p.lat).join(','), longitude: points.map((p) => p.lon).join(','), daily: 'river_discharge', ...params },
    timeout: 20000, maxContentLength: 8e6,
  });
  const list = [].concat(data);
  if (list.length !== points.length || list.some((p) => !Array.isArray(p?.daily?.time) || !Array.isArray(p.daily.river_discharge))) throw new Error('unexpected flood answer');
  return list.map((p) => ({ time: p.daily.time, discharge: p.daily.river_discharge }));
};

const hash = (s) => createHash('sha256').update(s).digest('hex');
const cellKey = (points) => `${points[0].lat.toFixed(3)},${points[0].lon.toFixed(3)}`;

// ask unless the same question failed a moment ago
async function askOnce(label, points, params, now) {
  if (failedUntil.get(label) > now.getTime()) throw new Error('flood answer failed recently');
  try { return await ask(points, params); } catch (error) { failedUntil.set(label, now.getTime() + RETRY_AFTER_MS); throw error; }
}

async function forecast(points, now) {
  const key = hash(`fc|${cellKey(points)}|${Math.floor(now.getTime() / SIX_HOURS)}`);
  const hit = await FloodForecast.findOne({ key }).lean();
  if (hit) return hit.data;
  if (failedUntil.get(`fc|${cellKey(points)}`) > now.getTime()) throw new Error('flood answer failed recently');
  if (!await reserveUsage('open-meteo-flood', weight(points, { past_days: 1, forecast_days: HORIZON_DAYS }), forecastBudgetPct(), now)) throw new Error('river forecast budget for today is used');
  const data = await askOnce(`fc|${cellKey(points)}`, points, { past_days: 1, forecast_days: HORIZON_DAYS }, now);
  await FloodForecast.updateOne({ key }, { $set: { data, createdAt: new Date() } }, { upsert: true });
  return data;
}

const percentile = (sorted, q) => sorted[Math.floor(q * (sorted.length - 1))];

// A new river's history costs about 460 weighted calls of Open-Meteo's 10,000 a day (17 years of one point; docs/FIELD_ALERTS.md, "Operations"), the
// weather of a field costs 1. So history is asked for only while the day's use is under this share (FLOOD_CLIMATE_BUDGET_PCT, default 50): the
// weather alerts, which every field needs, must never be starved by the river signal, which a field gets on a later day instead.
// The river forecast (3 weighted calls a cell) stops earlier than the weather (1 call) can run out: from this share of the day's allowance
// (FLOOD_FORECAST_BUDGET_PCT, default 80) only the weather is asked for, which every field needs.
const forecastBudgetPct = () => { const n = Number(process.env.FLOOD_FORECAST_BUDGET_PCT); return Number.isFinite(n) && n > 0 ? n : 80; };
const climateBudgetPct = () => { const n = Number(process.env.FLOOD_CLIMATE_BUDGET_PCT); return Number.isFinite(n) && n > 0 ? n : 50; };

// the usual range of one river point, from the reanalysis (it ends in July 2022, as Open-Meteo documents)
async function climate(point, now) {
  const key = hash(`clim|${point.lat.toFixed(3)},${point.lon.toFixed(3)}`);
  const hit = await FloodClimate.findOne({ key }).lean();
  if (hit) return hit.points[0];
  const params = { start_date: CLIMATE_FROM, end_date: '2022-07-31' };
  if (failedUntil.get(`clim|${key}`) > now.getTime()) throw new Error('flood answer failed recently');
  if (!await reserveUsage('open-meteo-flood', weight([point], params), climateBudgetPct(), now)) throw new Error('river history budget for today is used');
  const [{ discharge }] = await askOnce(`clim|${key}`, [point], params, now);
  const v = discharge.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const stats = v.length >= MIN_CLIMATE_DAYS ? { p90: percentile(v, 0.9), p95: percentile(v, 0.95), p99: percentile(v, 0.99), n: v.length } : { p90: 0, p95: 0, p99: 0, n: v.length };
  await FloodClimate.updateOne({ key }, { $set: { points: [stats], createdAt: new Date() } }, { upsert: true });
  return stats;
}

// { status: 'none' } no river here | { status: 'ok', peak, p95, p99, level, alert } | throws when Open-Meteo cannot be asked
export async function riverSignal(field, now = new Date()) {
  const [lon, lat] = field.location.coordinates;
  const points = cellPoints(lat, lon);
  const fc = await forecast(points, now);
  const today = istDate(now);
  const mean = (s) => s.reduce((t, x) => t + x.value, 0) / s.length;
  const rivers = points.map((point, i) => ({ point, series: fc[i].time.map((date, k) => ({ date, value: fc[i].discharge[k] })).filter((s) => s.date >= today && Number.isFinite(s.value)).slice(0, HORIZON_DAYS) }))
    .filter((v) => v.series.length && mean(v.series) >= MIN_FLOW);
  if (!rivers.length) return { status: 'none' };
  const river = rivers.sort((a, b) => mean(b.series) - mean(a.series))[0]; // the biggest river in reach
  const main = { ...river, ...await climate(river.point, now) };
  if (!main.p95) return { status: 'none' }; // too little history to say what is usual
  const peak = main.series.reduce((m, s) => (s.value > m.value ? s : m), main.series[0]);
  const offset = main.series.indexOf(peak);
  const rising = offset > 0 && peak.value > main.series[0].value * RISING;
  let level = !rising ? null : peak.value >= main.p99 ? 'warn' : peak.value >= main.p95 ? 'watch' : null;
  if (level === 'warn' && offset >= 4) level = 'watch'; // a long lead: never "warning" (as for our weather alerts)
  const summary = { status: 'ok', peak: r(peak.value), p95: r(main.p95), p99: r(main.p99), now: r(main.series[0].value), rising, level };
  if (!level) return summary;
  return { ...summary, alert: {
    id: `FLOOD-RIVER-1|${peak.date}`, rule: 'FLOOD-RIVER-1', hazard: 'flood_river', level, date: peak.date, offset, from: `${peak.date}T00:00`, to: `${addDays(peak.date, 1)}T00:00`,
    values: { metric: 'discharge', value: r(peak.value), threshold: r(level === 'warn' ? main.p99 : main.p95), levels: { warn: r(main.p99), watch: r(main.p95) }, series: main.series.map((s) => ({ date: s.date, value: r(s.value) })) },
    stage: field.stage, crop: field.crop, confidence: 'low', reviewStatus: reviewStatusOf('FLOOD-RIVER-1'),
  } };
}

export const resetFloodFailures = () => failedUntil.clear(); // for tests
