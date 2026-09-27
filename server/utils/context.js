// Context snapshot helpers (docs/CONTEXT_LAYER.md). Pure functions; the I/O is in services/contextSnapshot.js.
import { createHash } from 'node:crypto';
import { KB } from './environmentFit.js';

// Bump when the snapshot's content or method changes: stored snapshots of an older version are rebuilt once.
export const CONTEXT_VERSION = 1;
export const WINDOW_DAYS = 14; // weather days up to and including the reference date
export const OUTLOOK_DAYS = 3;
export const CAPTURED_MAX_AGE_DAYS = 60;
export const OPEN_METEO_PAST_DAYS = 92; // Open-Meteo docs: past_days "Integer (0-92)" (checked 27 Sep 2026)
export const SOIL_GRID = 0.0025; // ~250-280 m, about one SoilGrids cell: the geo-service only ever sees this point
const IST_OFFSET_MS = 5.5 * 3600 * 1000; // the app serves India: dates of server timestamps are Indian dates

export const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
export const istDate = (t) => new Date(new Date(t).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
// a real calendar date as YYYY-MM-DD (Date.parse alone accepts 2026-02-30 and rolls it into March)
export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// The photo's own date (EXIF DateTimeOriginal, sent by the client as captured_at) when it is believable:
// not in the future and not older than 60 days. -> { capturedAt: 'YYYY-MM-DD' } or { capturedAtRejected }
export function parseCapturedAt(value, now = new Date()) {
  if (value == null || value === '') return {};
  if (!isIsoDate(value)) return { capturedAtRejected: 'invalid' };
  const today = istDate(now);
  if (value > today) return { capturedAtRejected: 'future' };
  if (daysBetween(value, today) > CAPTURED_MAX_AGE_DAYS) return { capturedAtRejected: 'too_old' };
  return { capturedAt: value };
}

export const referenceDate = (p) => (p.capturedAt
  ? { date: p.capturedAt, source: 'exif' }
  : { date: istDate(p.createdAt), source: 'created_at', ...(p.capturedAtRejected ? { exifRejected: p.capturedAtRejected } : {}) });

export const snapSoil = (x) => (Math.round(x / SOIL_GRID) * SOIL_GRID).toFixed(4);
// the cache holds no readable location: a hash of the ~250 m cell (static data, kept until "Delete my data")
export const soilCacheKey = (lat, lon) => createHash('sha256').update(`soil|v1|${snapSoil(lat)},${snapSoil(lon)}`).digest('hex');

export const wantedDates = (ref) => [...Array(WINDOW_DAYS + OUTLOOK_DAYS)].map((_, i) => addDays(ref, i - WINDOW_DAYS + 1));

// Hourly Open-Meteo series (local time) -> one row per wanted date. A day needs >= 20 hourly values
// (same rule as utils/diseaseRisk.js); otherwise its values are null and the date is listed in `gaps`.
export function daysFromHourly(w, ref, today) {
  const by = new Map();
  w.time.forEach((t, i) => {
    const d = t.slice(0, 10);
    const e = by.get(d) ?? by.set(d, { temps: [], rhs: [], rain: 0, rainN: 0 }).get(d);
    if (w.temp[i] != null) e.temps.push(w.temp[i]);
    if (w.rh[i] != null) e.rhs.push(w.rh[i]);
    if (w.rain[i] != null) { e.rain += w.rain[i]; e.rainN++; }
  });
  const r1 = (x) => Math.round(x * 10) / 10;
  const days = wantedDates(ref).map((date) => {
    const e = by.get(date);
    const full = e && e.temps.length >= 20 && e.rhs.length >= 20;
    return {
      date, source: 'open-meteo', forecast: date > today,
      tmin: full ? r1(Math.min(...e.temps)) : null,
      tmean: full ? r1(e.temps.reduce((s, x) => s + x, 0) / e.temps.length) : null,
      tmax: full ? r1(Math.max(...e.temps)) : null,
      rhMean: full ? Math.round(e.rhs.reduce((s, x) => s + x, 0) / e.rhs.length) : null,
      rhMax: full ? Math.round(Math.max(...e.rhs)) : null,
      hoursRh90: full ? e.rhs.filter((h) => h >= 90).length : null,
      rain: full && e.rainN >= 20 ? r1(e.rain) : null,
    };
  });
  return days;
}

// ERA5-Land daily rows from the geo-service -> the same shape for the wanted dates
export function daysFromEra5(rows, ref, today) {
  const by = new Map(rows.map((r) => [r.date, r]));
  return wantedDates(ref).map((date) => ({
    date, source: 'era5-land', forecast: date > today,
    ...Object.fromEntries(['tmin', 'tmean', 'tmax', 'rhMean', 'rhMax', 'hoursRh90', 'rain'].map((k) => [k, by.get(date)?.[k] ?? null])),
  }));
}

// Summary of the 14 days up to and including the reference date (what the card and the PDF show)
export function weatherSummary(days, ref) {
  const past = days.filter((d) => d.date <= ref);
  const col = (k) => past.map((d) => d[k]).filter((v) => v != null);
  const avg = (k) => { const v = col(k); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };
  const sum = (k) => { const v = col(k); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) * 10) / 10 : null; };
  const hours = col('hoursRh90');
  return {
    days: past.length, daysWithData: col('tmean').length,
    tminMean: avg('tmin'), tmeanMean: avg('tmean'), tmaxMean: avg('tmax'), rhMean: avg('rhMean'),
    hoursRh90: hours.length ? hours.reduce((s, x) => s + x, 0) : null,
    wetDays12: hours.length ? hours.filter((h) => h >= 12).length : null, // days with >= 12 h at RH >= 90%
    rainMm: sum('rain'),
  };
}

export const gapsOf = (days) => days.filter((d) => d.tmean == null && !d.forecast).map((d) => d.date);

export function seasonOf(date, kb = KB) {
  return { names: kb.seasons.months[String(Number(date.slice(5, 7)))], source_id: kb.seasons.source.id,
    note: 'calendar season of the reference date, not the crop\'s sowing date' };
}

// What the card and the PDF must credit, by which sources the snapshot used
export function attributions({ weatherSource, soil, rainSource, fieldHealth }, year = new Date().getFullYear()) {
  const a = [];
  if (weatherSource === 'open-meteo') a.push('Weather data by Open-Meteo.com (CC BY 4.0)');
  if (weatherSource === 'era5-land' || rainSource === 'era5-land') a.push(`Generated using Copernicus Climate Change Service information ${year} (ERA5-Land)`);
  if (rainSource === 'chirps') a.push('Rainfall: CHIRPS, Climate Hazards Center, UC Santa Barbara (public domain)');
  if (soil) a.push('Soil: ISRIC SoilGrids 250 m (CC BY 4.0)');
  if (fieldHealth) {
    a.push('Contains modified Copernicus Sentinel data processed by ESA / Google Earth Engine');
    a.push('Land cover: © ESA WorldCover project 2021 (CC BY 4.0)');
  }
  return a;
}
