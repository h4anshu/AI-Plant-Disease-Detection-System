import axios from "axios";
import { CwcStation } from "../../models/Flood.js";
import { addDays, istDate } from "../../utils/context.js";
import { UA } from "./sachet.js";

// Central Water Commission river gauges, from the JSON its own flood-forecast site (ffs.india-water.gov.in) reads. Not a documented
// API and no terms were found, so: a kill switch (ALERTS_DISABLED_SOURCES=cwc), and it is shown as "the nearest gauge", never as a
// forecast for the field. Two lists are joined by station code: where the gauges are (static, refreshed daily) and which of them are
// above their warning level now (a few KB, every 30 minutes). docs/FIELD_ALERTS.md, "Flood".
const base = () => process.env.CWC_URL || 'https://ffs.india-water.gov.in';
const SPEC = encodeURIComponent(JSON.stringify({ where: { expression: { valueIsRelationField: false, fieldName: 'layerStationStationCode.floodForecastStaticStationCode.type', operator: 'eq', value: 'Level' } },
  or: { expression: { valueIsRelationField: false, fieldName: 'layerStationStationCode.floodForecastStaticStationCode.type', operator: 'eq', value: 'Inflow' } } }));
const GEO_EVERY_MS = 24 * 3600e3;
const RADIUS_M = 25000;
const get = async (path) => (await axios.get(`${base()}${path}`, { timeout: 20000, maxContentLength: 8e6, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
const code = (c) => String(c ?? '').trim().toLowerCase();

export const parseStations = (list) => (Array.isArray(list) ? list : []).map((s) => ({ code: code(s.stationCode), name: String(s.name ?? s.stationCode ?? ''), type: String(s.type ?? ''), lat: Number(s.lat), lon: Number(s.lon) }))
  .filter((s) => s.code && Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180);
// only a list is an answer: an error page must not read as "nothing is above warning" and clear every real warning
export const parseStatus = (list) => { if (!Array.isArray(list)) throw new Error('not a status list'); return list.map((s) => ({ code: code(s.stationCode), status: String(s.status ?? '').toUpperCase(), trend: String(s.trend ?? '').toLowerCase() }))
  .filter((s) => s.code && ['WARNING', 'DANGER'].includes(s.status)); };

export async function ingestCwc({ now = new Date() } = {}) {
  const status = parseStatus(await get('/ffm/api/station-water-level-above-warning/'));
  const newest = await CwcStation.findOne({}, 'fetchedAt').sort({ fetchedAt: -1 }).lean();
  if (!newest || now - newest.fetchedAt > GEO_EVERY_MS) {
    const stations = parseStations(await get(`/iam/api/layer-station-geo/specification/?specification=${SPEC}`));
    if (stations.length < 50) throw new Error('station list too short'); // a changed or empty answer must not wipe the gauges
    await CwcStation.bulkWrite(stations.map((s) => ({ updateOne: { filter: { code: s.code }, update: { $set: { name: s.name, type: s.type, loc: { type: 'Point', coordinates: [s.lon, s.lat] }, fetchedAt: now } }, upsert: true } })));
  }
  // the list holds only stations above warning: everything else is below it
  await CwcStation.updateMany({ code: { $nin: status.map((s) => s.code) }, status: { $ne: null } }, { $set: { status: null, trend: null, statusAt: now } });
  for (const s of status) await CwcStation.updateOne({ code: s.code }, { $set: { status: s.status, trend: s.trend, statusAt: now } });
  return { recordCount: status.length, newestItemAt: now };
}

const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => { const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const nearest5 = (n) => Math.max(5, Math.round(n / 5) * 5); // "about 20 km": the exact distance to a known gauge would narrow the field's place down

// The nearest gauges within 25 km: the nearest one above its warning level if there is one, else simply the nearest.
// -> { status: 'none' } no gauge in reach | { status: 'ok', name, km, level: null|'watch'|'warn', trend, alert? }
export async function gaugeFor(field, now = new Date()) {
  const point = field.location.coordinates;
  const near = await CwcStation.find({ loc: { $near: { $geometry: { type: 'Point', coordinates: point }, $maxDistance: RADIUS_M } } }).limit(8).lean();
  if (!near.length) return { status: 'none' };
  const hit = near.find((s) => s.status) ?? near[0];
  const level = hit.status === 'DANGER' ? 'warn' : hit.status === 'WARNING' ? 'watch' : null;
  const out = { status: 'ok', name: hit.name, km: nearest5(km(point, hit.loc.coordinates)), level, trend: hit.trend };
  if (!level) return out;
  const today = istDate(now);
  return { ...out, alert: {
    id: `CWC|${hit.code}|${today}`, origin: 'official', source: 'cwc', issuer: 'CWC', level, family: 'flood', station: hit.name, km: out.km, trend: hit.trend,
    date: today, offset: 0, from: `${today}T00:00`, to: `${addDays(today, 1)}T00:00`, issuedAt: hit.statusAt.toISOString(),
    expires: new Date(Date.parse(`${addDays(today, 1)}T00:00:00Z`) - 19800e3).toISOString(), link: 'https://ffs.india-water.gov.in/',
  } };
}
