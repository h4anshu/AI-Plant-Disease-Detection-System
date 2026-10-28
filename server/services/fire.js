import { createHash } from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import { snap } from "./openMeteo.js";
import { countUsage } from "./usage.js";
import { reviewStatusOf } from "../utils/alertRules.js";
import { addDays, istDate } from "../utils/context.js";

// Fires near a field, seen by satellite (docs/FIELD_ALERTS.md, "Fire near the field"). NASA FIRMS Area API, free with a MAP_KEY
// (FIRMS_MAP_KEY, kept on the server, never sent to the browser); limit 5,000 requests per 10 minutes. Only the 0.05° cell of the field
// is sent to NASA (a box of about 22 km around its centre); the distance to each fire is worked out here, and the answer carries a
// distance band, a count and a time, never the fires' or the field's coordinates.
const base = () => process.env.FIRMS_URL || 'https://firms.modaps.eosdis.nasa.gov';
const SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']; // 375 m detections; MODIS (1 km) is left out
const HALF_BOX = 0.1;        // degrees around the cell centre
const RADIUS_KM = 5;
const WINDOW_H = 24;
const BANDS = [[1, 'warn'], [3, 'watch'], [5, 'info']]; // within 1 km: warning, 3 km: watch, 5 km: tip (ours)
const CACHE_S = 30 * 60;     // a cell is asked for at most every 30 minutes
const FAIL_MS = 10 * 60e3;   // after a failure the cell is not asked again for 10 minutes

const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fires: { type: mongoose.Schema.Types.Mixed, required: true },     // [{ lat, lon, at }] of a public satellite product, not of a field
  createdAt: { type: Date, default: Date.now, expires: CACHE_S },
});
export const FireCache = mongoose.models.FireCache || mongoose.model('FireCache', cacheSchema);

const failed = new Map();
export const resetFireFailures = () => failed.clear();

// FIRMS answers a CSV, and says "Invalid MAP_KEY." or a quota message in plain text: only a body with the header is an answer.
// -> [{ lat, lon, at: Date }] without the low-confidence detections
export function parseFires(csv) {
  const [head, ...rows] = String(csv).trim().split(/\r?\n/);
  const cols = head?.split(',');
  const at = (n) => cols?.indexOf(n);
  if (!cols || ![ 'latitude', 'longitude', 'acq_date', 'acq_time', 'confidence'].every((n) => at(n) >= 0)) throw new Error('not a FIRMS table');
  return rows.map((row) => row.split(',')).map((c) => {
    const time = c[at('acq_time')].padStart(4, '0');
    return { lat: Number(c[at('latitude')]), lon: Number(c[at('longitude')]), at: new Date(`${c[at('acq_date')]}T${time.slice(0, 2)}:${time.slice(2)}:00Z`), conf: c[at('confidence')] };
  }).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && !Number.isNaN(f.at.getTime()) && f.conf !== 'l');
}

const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

async function firesAround(la, lo, now) {
  const key = createHash('sha256').update(`fire1|${la}|${lo}`).digest('hex');
  const cached = await FireCache.findOne({ key }).lean();
  if (cached) return cached.fires.map((f) => ({ ...f, at: new Date(f.at) }));
  if (failed.get(key) > now.getTime()) throw new Error('fire check failed recently');
  try {
    await countUsage('firms', SOURCES.length);
    const area = [lo - HALF_BOX, la - HALF_BOX, lo + HALF_BOX, la + HALF_BOX].map((x) => x.toFixed(2)).join(',');
    const tables = await Promise.all(SOURCES.map(async (s) => parseFires((await axios.get(`${base()}/api/area/csv/${process.env.FIRMS_MAP_KEY}/${s}/${area}/2`, { timeout: 20000, responseType: 'text', maxContentLength: 4e6 })).data)));
    const seen = new Set(); // one fire seen by two satellites counts once: the same 0.004° square (about 400 m) in the same hour
    const fires = tables.flat().filter((f) => { const id = `${Math.round(f.lat / 0.004)}|${Math.round(f.lon / 0.004)}|${Math.floor(f.at.getTime() / 3600e3)}`; return !seen.has(id) && seen.add(id); });
    await FireCache.updateOne({ key }, { $set: { fires, createdAt: now } }, { upsert: true });
    return fires;
  } catch (error) {
    failed.set(key, now.getTime() + FAIL_MS);
    throw error;
  }
}

// -> an alert shaped like the others (client/src/components/workspace/alertParts.jsx), or null when no fire was seen within 5 km in 24 hours.
// Throws when the fires could not be asked for (the caller says "unavailable", never "no fire").
export async function fireFor(field, now = new Date()) {
  const [lon, lat] = field.location.coordinates;
  const point = { lat, lon };
  const fires = await firesAround(snap(lat), snap(lon), now);
  const near = fires.filter((f) => now - f.at <= WINDOW_H * 3600e3 && f.at <= new Date(now.getTime() + 600e3))
    .map((f) => ({ ...f, km: km(point, f) })).filter((f) => f.km <= RADIUS_KM);
  if (!near.length) return null;
  const nearest = Math.min(...near.map((f) => f.km));
  const [band, level] = BANDS.find(([b]) => nearest <= b);
  const today = istDate(now);
  return {
    id: `FIRE-NEAR-1|${today}`, rule: 'FIRE-NEAR-1', hazard: 'fire_near', level, date: today, offset: 0, from: `${today}T00:00`, to: `${addDays(today, 1)}T00:00`,
    values: { metric: 'fire', count: near.length, nearKm: band, newest: new Date(Math.max(...near.map((f) => f.at.getTime()))).toISOString(), window: WINDOW_H, radiusKm: RADIUS_KM },
    stage: field.stage, crop: field.crop, confidence: 'medium', reviewStatus: reviewStatusOf('FIRE-NEAR-1'),
  };
}
