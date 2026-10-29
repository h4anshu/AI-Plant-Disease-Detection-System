import { createHash } from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import FieldModel, { MAX_FIELDS, MAX_NAME } from "../models/Field.js";
import { CROPS } from "../models/Prediction.js";
import { STAGES, conditions, evaluate, horizon, localHour, localHourFraction } from "../utils/alertRules.js";
import { ATTRIBUTION, getWeather, snap } from "../services/openMeteo.js";
import { ownerFilter } from "./predictController.js";
import logger, { logError } from "../utils/logger.js";
import { ensureDistricts, ensureFresh, refresh, sourceStatus } from "../services/alerts/ingest.js";
import { officialFor, sortOfficial } from "../services/alerts/official.js";
import { gaugeFor } from "../services/alerts/cwc.js";
import { isEnabled } from "../services/alerts/ingest.js";
import { riverSignal } from "../services/flood.js";
import { FloodExtentCache, extentKey } from "../models/Flood.js";
import { FEEDS, linksFor, newsFor } from "../services/news.js";
import { nearbyDisease } from "../services/nearbyDisease.js";
import { fireFor } from "../services/fire.js";
import { pricesFor } from "../services/mandi.js";
import { countUsage } from "../services/usage.js";
import AlertFeedback, { ANSWERS, KNOWN_RULES, LEVELS } from "../models/AlertFeedback.js";
import { istDate } from "../utils/context.js";
import { lgdDistrict } from "../utils/districts.js";

// Saved fields and their weather alerts (docs/FIELD_ALERTS.md). The exact point is private: it is stored,
// used to ask Open-Meteo for its 0.05° grid cell, and never returned.
const toResponse = (f) => ({ _id: String(f._id), name: f.name, crop: f.crop, stage: f.stage, createdAt: f.createdAt });

const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

// body -> the fields of a Field, or { error }. `partial`: a PATCH, only name and stage can change.
function parse(body, partial) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.trim().length > MAX_NAME) return { error: 'Invalid name' };
    out.name = b.name.trim();
  }
  if (b.stage !== undefined || !partial) {
    if (!STAGES.includes(b.stage)) return { error: 'Invalid stage' };
    out.stage = b.stage;
  }
  if (partial) return { out };
  if (!CROPS.includes(b.crop)) return { error: 'Invalid crop' };
  out.crop = b.crop;
  const lat = num(b.lat);
  const lon = num(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: 'Invalid location' };
  out.location = { type: 'Point', coordinates: [lon, lat] }; // GeoJSON order: lon, lat
  return { out };
}

const missingOwner = (res) => res.status(400).json({ message: 'Missing device id' });
const validId = (req) => mongoose.isValidObjectId(req.params.id);

// @route  GET /api/fields
export const listFields = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner) return res.json([]);
    const fields = await FieldModel.find(owner).sort({ createdAt: 1 }).lean();
    res.json(fields.map(toResponse));
  } catch (error) {
    logError(req, 'List fields failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  POST /api/fields  { crop, stage, lat, lon, name? }
export const createField = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner) return missingOwner(res);
    const { out, error } = parse(req.body, false);
    if (error) return res.status(400).json({ message: error });
    if (await FieldModel.countDocuments(owner) >= MAX_FIELDS) {
      return res.status(409).json({ message: `You can save up to ${MAX_FIELDS} fields. Delete one to add another.` });
    }
    const field = await FieldModel.create({ ...owner, ...out });
    res.status(201).json(toResponse(field));
  } catch (error) {
    logError(req, 'Create field failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/fields/:id/flood-extent
// Is the area around the field newly under water, from the newest Sentinel-1 radar image (geo-service, Earth Engine)? On demand, never
// part of the alerts read: each uncached call is an Earth Engine computation. The place goes to the geo-service in a POST body only;
// the answer holds no coordinates. Cached per place (rounded to about 100 m) and day.
const GEO_TIMEOUT_MS = 60000;
export const getFloodExtent = async (req, res) => {
  try {
    if (!process.env.GEO_SERVICE_URL || !isEnabled('radar')) return res.status(503).json({ message: 'The satellite flood check is not available' });
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const field = await FieldModel.findOne({ _id: req.params.id, ...owner }).select('location').lean();
    if (!field) return res.status(404).json({ message: 'Field not found' });
    const [lon, lat] = field.location.coordinates;
    const key = extentKey(lat, lon, new Date().toISOString().slice(0, 10));
    const cached = await FloodExtentCache.findOne({ key }).lean();
    if (cached) return res.json({ ...cached.result, cached: true });
    let data;
    try {
      ({ data } = await axios.post(`${process.env.GEO_SERVICE_URL}/flood-extent`, { lat, lon },
        { headers: { 'x-geo-token': process.env.GEO_SERVICE_TOKEN ?? '', 'x-request-id': req.id }, timeout: GEO_TIMEOUT_MS }));
    } catch (err) {
      const status = err.response?.status;
      logger.error({ requestId: req.id, geoStatus: status ?? null, code: err.code ?? null, error: err.message }, 'geo-service flood call failed');
      return status === 503
        ? res.status(503).json({ message: 'The satellite service is busy. Please try again later.' })
        : res.status(502).json({ message: 'Satellite data is unavailable right now. Please try again shortly.' });
    }
    await countUsage('earth-engine-radar');
    await FloodExtentCache.updateOne({ key }, { $set: { result: data, createdAt: new Date() } }, { upsert: true });
    logger.info({ requestId: req.id, status: data.status, flag: data.flag ?? null }, 'flood extent');
    res.json({ ...data, cached: false });
  } catch (error) {
    logError(req, 'Flood extent failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  PATCH /api/fields/:id  { stage?, name? }
export const updateField = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const { out, error } = parse(req.body, true);
    if (error) return res.status(400).json({ message: error });
    const field = await FieldModel.findOneAndUpdate({ _id: req.params.id, ...owner }, { $set: out }, { returnDocument: 'after', runValidators: true });
    if (!field) return res.status(404).json({ message: 'Field not found' });
    res.json(toResponse(field));
  } catch (error) {
    logError(req, 'Update field failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  DELETE /api/fields/:id
export const deleteField = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const { deletedCount } = await FieldModel.deleteOne({ _id: req.params.id, ...owner });
    if (!deletedCount) return res.status(404).json({ message: 'Field not found' });
    res.json({ deleted: 1 });
  } catch (error) {
    logError(req, 'Delete field failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/fields/alerts -> every saved field with its alerts, 72-hour strip and conditions.
// Flood signals of one field (docs/FIELD_ALERTS.md, "Flood"): the regional river signal and the nearest CWC gauge. Each can fail or be
// switched off on its own and then says so; neither needs the field's weather.
async function floodFor(f, now, sources, requestId) {
  // radar: whether the satellite flood check can be asked for (the screen shows its button only then)
  const out = { river: { status: 'unavailable' }, gauge: { status: 'unavailable' }, radar: { status: process.env.GEO_SERVICE_URL && isEnabled('radar') ? 'ready' : 'disabled' }, alerts: [], official: [] };
  if (!isEnabled('glofas')) out.river = { status: 'disabled' };
  else {
    try {
      const { alert, ...river } = await riverSignal(f, now);
      out.river = river;
      if (alert) out.alerts.push(alert);
    } catch (err) { logger.warn({ requestId, status: err.response?.status ?? null, code: err.code ?? null, message: err.message }, 'River signal failed'); }
  }
  const cwc = sources.find((s) => s.source === 'cwc');
  if (!isEnabled('cwc')) out.gauge = { status: 'disabled' };
  else if (cwc && cwc.state !== 'down') {
    try {
      const { alert, ...gauge } = await gaugeFor(f, now);
      out.gauge = gauge;
      if (alert) out.official.push(alert);
    } catch (err) { logger.warn({ requestId, message: err.message }, 'Gauge lookup failed'); }
  }
  return out;
}

// What is seen around the field rather than forecast: disease reports from other browsers (kill switch `community`) and fires seen by
// satellite (kill switch `fire`, needs FIRMS_MAP_KEY). A failure only leaves that alert out; for fires it is said, so that "no fire"
// is never shown when the fires could not be asked for. -> { alerts, fire: { status: ok | unavailable | disabled } }
async function observedAlerts(f, req, now) {
  const out = { alerts: [], fire: { status: 'disabled' } };
  if (isEnabled('community')) {
    try { const a = await nearbyDisease(f, ownerFilter(req), now); if (a) out.alerts.push(a); } catch (err) { logger.warn({ requestId: req.id, message: err.message }, 'Disease reports nearby failed'); }
  }
  if (process.env.FIRMS_MAP_KEY && isEnabled('fire')) {
    try { const a = await fireFor(f, now); out.fire = { status: 'ok' }; if (a) out.alerts.push(a); } catch (err) {
      out.fire = { status: 'unavailable' };
      logger.warn({ requestId: req.id, status: err.response?.status ?? null, code: err.code ?? null, message: err.message }, 'Fire check failed'); // the key is in the request URL, never in these fields
    }
  }
  return out;
}

// Computed on read from the weather the server already caches per grid cell (services/openMeteo.js).
// A field whose weather could not be loaded says so (status "weather_unavailable"): never an empty list.
export const getAlerts = async (req, res) => {
  try {
    const now = new Date();
    const owner = ownerFilter(req);
    const fields = owner ? await FieldModel.find(owner).sort({ createdAt: 1 }).lean() : [];
    // official warnings (NDMA SACHET, IMD): refreshed when due, matched through each field's districts; a failure here never fails the answer
    let official = new Map();
    let sources = [];
    if (fields.length) {
      try {
        await Promise.all([ensureFresh({ now }), ensureDistricts(fields, now)]);
        [official, sources] = await Promise.all([officialFor(fields, now), sourceStatus(now)]);
      } catch (err) {
        logger.error({ requestId: req.id, message: err.message }, 'Official warnings failed');
      }
    }
    const floods = new Map(await Promise.all(fields.map(async (f) => [String(f._id), await floodFor(f, now, sources, req.id)])));
    // fields in one grid cell share one weather call (they would all miss the cache at the same moment)
    const calls = new Map();
    const weatherOf = (lat, lon) => {
      const key = `${snap(lat).toFixed(2)},${snap(lon).toFixed(2)}`;
      if (!calls.has(key)) calls.set(key, getWeather(lat, lon, now));
      return calls.get(key);
    };
    const results = await Promise.all(fields.map(async (f) => {
      const flood = floods.get(String(f._id));
      const seen = await observedAlerts(f, req, now);
      const near = seen.alerts;
      const base = { ...toResponse(f), official: sortOfficial([...(official.get(String(f._id)) ?? []), ...flood.official]), flood: { river: flood.river, gauge: flood.gauge, radar: flood.radar }, fire: seen.fire };
      try {
        const [lon, lat] = f.location.coordinates;
        const w = await weatherOf(lat, lon);
        const nowHour = localHour(w.utcOffsetSeconds, now);
        const today = nowHour.slice(0, 10);
        return { ...base, status: 'ok', today, timezone: w.timezone, alerts: [...evaluate(f, w, now), ...flood.alerts, ...near],
          horizon: horizon(w, today, localHourFraction(w.utcOffsetSeconds, now)), conditions: conditions(w, today, nowHour) };
      } catch (err) {
        logger.error({ requestId: req.id, status: err.response?.status ?? null, code: err.code ?? null, message: err.message }, 'Field weather failed');
        return { ...base, status: 'weather_unavailable', alerts: [...flood.alerts, ...near] };
      }
    }));
    res.json({ checkedAt: now.toISOString(), weatherSource: ATTRIBUTION, officialSources: sources.filter((s) => s.source !== 'news').map(({ source, state, fetchedAt }) => ({ source, state, fetchedAt })), fields: results });
  } catch (error) {
    logError(req, 'Field alerts failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  POST /api/fields/:id/alerts/feedback  { alertId, level, answer: acted | not_needed | wrong }
// "Did this help?" (docs/FIELD_ALERTS.md, "Evaluation"). One answer per browser per rule and date; answering again replaces it. Stores the rule,
// the date, the level, the answer and the field's crop and stage, never a place, a field id or an official alert's identifier.
export const giveAlertFeedback = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const { alertId, level, answer } = req.body ?? {};
    if (typeof alertId !== 'string' || !/^[A-Za-z0-9_.:|-]{3,120}$/.test(alertId)) return res.status(400).json({ message: 'Invalid alert' });
    const [rule, ...rest] = alertId.split('|');
    if (!KNOWN_RULES.includes(rule)) return res.status(400).json({ message: 'Unknown alert' });
    if (!ANSWERS.includes(answer)) return res.status(400).json({ message: `answer must be one of ${ANSWERS.join(', ')}` });
    if (!LEVELS.includes(level)) return res.status(400).json({ message: `level must be one of ${LEVELS.join(', ')}` });
    const field = await FieldModel.findOne({ _id: req.params.id, ...owner }).select('crop stage').lean();
    if (!field) return res.status(404).json({ message: 'Field not found' });
    const date = rest.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) ?? istDate(new Date()); // SACHET ids carry no date: today's
    // the unique key is (deviceId, alertKey): an account has no device id, so its own stands in
    await AlertFeedback.updateOne({ deviceId: owner.deviceId ?? `user:${owner.userId}`, alertKey: `${rule}|${date}` },
      { $set: { userId: owner.userId, rule, level, answer, crop: field.crop, stage: field.stage, createdAt: new Date() } }, { upsert: true });
    res.json({ saved: 1 });
  } catch (error) {
    logError(req, 'Alert feedback failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/fields/:id/prices -> the last mandi prices reported for this field's crop in its state (docs/FIELD_ALERTS.md, "Mandi prices").
// Only the state and the commodity go to data.gov.in. status: ok | stale | none | unavailable | disabled | no_state. Always a 200: a card, not an alert.
export const getPrices = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const field = await FieldModel.findOne({ _id: req.params.id, ...owner }).lean();
    if (!field) return res.status(404).json({ message: 'Field not found' });
    if (!process.env.DATA_GOV_API_KEY || !isEnabled('mandi')) return res.json({ status: 'disabled', crop: field.crop });
    const now = new Date();
    await ensureDistricts([field], now);
    const first = lgdDistrict(field.district?.lgd?.[0]?.code);
    if (!first) return res.json({ status: 'no_state', crop: field.crop });
    const names = [...(field.district.lgd ?? []).map((d) => d.name), ...(field.district.imd ?? []).map((d) => d.name)];
    try {
      res.json({ ...await pricesFor(first.state, field.crop, names, now), state: first.state, crop: field.crop, unit: 'quintal' });
    } catch (err) {
      logger.warn({ requestId: req.id, status: err.response?.status ?? null, code: err.code ?? null, message: err.message }, 'Mandi prices failed'); // the key is in the request URL, never in these fields
      res.json({ status: 'unavailable', state: first.state, crop: field.crop });
    }
  } catch (error) {
    logError(req, 'Field prices failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/fields/:id/news -> headlines and official pages for this field's state and crop (docs/FIELD_ALERTS.md, "News and advisories").
// Only the state's name leaves the server, never the place. The feeds are refreshed when due; a feed that is down just gives fewer items.
export const getNews = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !validId(req)) return res.status(404).json({ message: 'Field not found' });
    const field = await FieldModel.findOne({ _id: req.params.id, ...owner }).lean();
    if (!field) return res.status(404).json({ message: 'Field not found' });
    const now = new Date();
    await Promise.all([refresh('news', { now }), ensureDistricts([field], now)]);
    const state = lgdDistrict(field.district?.lgd?.[0]?.code)?.state ?? null;
    res.json({ state, crop: field.crop, items: isEnabled('news') ? await newsFor(state, field.crop, now) : [], links: linksFor(state), sources: FEEDS.map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    logError(req, 'Field news failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
