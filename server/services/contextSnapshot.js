// Builds the context snapshot of a checkup (docs/CONTEXT_LAYER.md): weather around the photo date, the
// rainfall anomaly, modelled soil, the cached field-health answer and the season. All or nothing: any
// upstream failure throws UpstreamError and nothing is stored, so the next open simply tries again.
import axios from "axios";
import FieldHealthCache, { keyForPrediction } from "../models/FieldHealthCache.js";
import SoilCache from "../models/SoilCache.js";
import { assess, MODELS, RISK_CROPS } from "../utils/diseaseRisk.js";
import { getWeather, getWeatherRange } from "./openMeteo.js";
import {
  addDays, attributions, CONTEXT_VERSION, daysFromEra5, daysFromHourly, gapsOf, istDate, OPEN_METEO_PAST_DAYS,
  OUTLOOK_DAYS, referenceDate, seasonOf, snapSoil, soilCacheKey, WINDOW_DAYS, weatherSummary,
} from "../utils/context.js";

const GEO_TIMEOUT_MS = 90000;
// Measured with Cloud Monitoring per workload tag, 5 calls each, 27 Sep 2026 (docs/CONTEXT_LAYER.md "Cost"):
// EECU-seconds per part. Earth Engine does not report the cost of one request, so the snapshot records this estimate.
// ponytail: the ERA5-Land rainfall normal (20 years) dominates; cache it per 0.1° cell and calendar window if quota gets tight.
export const EECU = { soil: 0.05, rain: { chirps: 1.6, 'era5-land': 4.0 }, era5: 0.8 };
const eecuOf = (parts, rainSource) => Math.round(parts.reduce((s, k) =>
  s + (k === 'rain' ? EECU.rain[rainSource] ?? 0 : EECU[k] ?? 0), 0) * 100) / 100;

export class UpstreamError extends Error {
  constructor(status, what, cause) {
    super(`${what} unavailable`);
    this.status = status; // 502 or 503
    this.what = what; // 'weather' | 'geo'
    this.upstreamStatus = cause?.response?.status ?? null;
    this.code = cause?.code ?? null;
  }
}

const min = (a, b) => (a < b ? a : b);

async function callGeo(body, requestId) {
  try {
    const { data } = await axios.post(`${process.env.GEO_SERVICE_URL}/context`, body,
      { headers: { 'x-geo-token': process.env.GEO_SERVICE_TOKEN ?? '', 'x-request-id': requestId }, timeout: GEO_TIMEOUT_MS });
    return data;
  } catch (err) {
    throw new UpstreamError(err.response?.status === 503 ? 503 : 502, 'geo', err);
  }
}

// The published model for the crop (potato late blight, rice blast), for the reference day only
function riskModel(crop, hourly, ref) {
  if (!RISK_CROPS.includes(crop)) return null;
  const name = MODELS[crop].model.name;
  if (!hourly) return { name, date: ref, level: null, reason: 'needs_hourly_weather' };
  const day = assess(crop, hourly, ref).days.find((d) => d.date === ref);
  return { name, date: ref, level: day?.level ?? null, conditions: day?.conditions ?? null, citation: MODELS[crop].model.citation,
    url: MODELS[crop].model.url, ...(day?.level ? {} : { reason: 'not_enough_weather' }) };
}

function fieldHealthPart(cached) {
  const r = cached?.result;
  if (!r) return { status: 'not_requested' };
  return { status: 'cached', verdict: r.flag?.code ?? null, since: r.flag?.since ?? null, stale: r.flag?.stale ?? null,
    lastClearDate: r.last_clear_date ?? null, latestNdvi: r.latest?.ndvi ?? null, latestZ: r.latest?.z ?? null,
    window: r.window ?? null };
}

// p: the prediction (location, crop, createdAt, capturedAt, capturedAtRejected)
export async function buildSnapshot(p, { requestId, now = new Date() } = {}) {
  const [lon, lat] = p.location.coordinates;
  const reference = referenceDate(p);
  const ref = reference.date;
  const today = istDate(now);
  const historyStart = addDays(ref, -WINDOW_DAYS); // INDO-BLIGHTCAST needs 13 days before the day it rates
  const openMeteo = historyStart >= addDays(today, -OPEN_METEO_PAST_DAYS);
  const soilKey = soilCacheKey(lat, lon);

  const cachedSoil = await SoilCache.findOne({ key: soilKey }).lean();
  // the geo-service only sees the ~250 m cell centre, never the exact point
  const geoBody = { lat: Number(snapSoil(lat)), lon: Number(snapSoil(lon)), soil: !cachedSoil, rain_ref: ref,
    ...(openMeteo ? {} : { era5_start: addDays(ref, -(WINDOW_DAYS - 1)), era5_end: min(addDays(ref, OUTLOOK_DAYS), today) }) };

  const weatherCall = !openMeteo ? null
    : ref === today ? getWeather(lat, lon, now) // same query and cache as the risk strip
      : getWeatherRange(lat, lon, historyStart, min(addDays(ref, OUTLOOK_DAYS + 1), addDays(today, 15)), now);
  const [hourly, geo, fh] = await Promise.all([
    weatherCall?.catch((err) => { throw new UpstreamError(502, 'weather', err); }) ?? null,
    callGeo(geoBody, requestId),
    FieldHealthCache.findOne({ key: keyForPrediction(p) }).lean(),
  ]);

  const soil = cachedSoil ? cachedSoil.result.soil : geo.soil;
  if (!cachedSoil) await SoilCache.updateOne({ key: soilKey }, { $set: { result: { soil: geo.soil ?? null } } }, { upsert: true });

  const days = openMeteo ? daysFromHourly(hourly, ref, today) : daysFromEra5(geo.era5 ?? [], ref, today);
  const weatherSource = openMeteo ? 'open-meteo' : 'era5-land';
  const rain = geo.rain_anomaly ?? { status: 'unknown', source: null, reason: 'not computed' };
  const fieldHealth = fieldHealthPart(fh);
  const parts = geo.parts ?? [];
  return {
    version: CONTEXT_VERSION,
    computedAt: now.toISOString(),
    reference,
    weather: { source: weatherSource, grid: openMeteo ? '0.05° (~5 km)' : '0.1° (~11 km)',
      timezone: hourly?.timezone ?? 'Asia/Kolkata', days, gaps: gapsOf(days), summary: weatherSummary(days, ref) },
    rainAnomaly: rain,
    soil,
    fieldHealth,
    season: seasonOf(ref),
    riskModel: riskModel(p.crop, openMeteo ? hourly : null, ref),
    provenance: {
      sources: [
        openMeteo ? { cx: 'CX-01', dataset: 'Open-Meteo forecast API (hourly)', dates: `${days[0].date}..${days.at(-1).date}` }
          : { cx: 'CX-02', dataset: 'ECMWF/ERA5_LAND/DAILY_AGGR', dates: `${geoBody.era5_start}..${geoBody.era5_end}` },
        ...(rain.source === 'chirps' ? [{ cx: 'CX-03', dataset: 'UCSB-CHG/CHIRPS/DAILY', dates: `${rain.windowStart}..${rain.windowEnd}` }] : []),
        ...(rain.source === 'era5-land' ? [{ cx: 'CX-02', dataset: 'ECMWF/ERA5_LAND/DAILY_AGGR (rainfall)', dates: `${rain.windowStart}..${rain.windowEnd}` }] : []),
        ...(soil ? [{ cx: 'CX-06', dataset: 'projects/soilgrids-isric/*_mean (0-30 cm)', dates: 'static', cached: Boolean(cachedSoil) }] : []),
        ...(fieldHealth.status === 'cached' ? [{ cx: 'CX-08, CX-09', dataset: 'field-health cache (Sentinel-2, WorldCover)', dates: fieldHealth.window ? `${fieldHealth.window.start}..${fieldHealth.window.end}` : null }] : []),
        { cx: null, dataset: 'season calendar (Indian Economic Service)', dates: ref },
      ],
      attributions: attributions({ weatherSource, soil: Boolean(soil), rainSource: rain.source, fieldHealth: fieldHealth.status === 'cached' }, now.getFullYear()),
      latestAvailable: geo.latest ?? null,
      geoParts: parts,
      eecuEstimate: eecuOf(parts, rain.source),
      calls: { geoService: 1, openMeteo: openMeteo ? 1 : 0 }, // at most; a cached Open-Meteo answer costs nothing
    },
  };
}
