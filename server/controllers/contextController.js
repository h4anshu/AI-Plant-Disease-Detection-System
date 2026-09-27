import mongoose from "mongoose";
import PredictionModel from "../models/Prediction.js";
import { ownerFilter } from "./predictController.js";
import { buildSnapshot, UpstreamError } from "../services/contextSnapshot.js";
import { CONTEXT_VERSION, daysBetween, isIsoDate, istDate } from "../utils/context.js";
import { contextFit, KB } from "../utils/environmentFit.js";
import logger, { logError } from "../utils/logger.js";

const FIELDS = 'crop status disease top3 location createdAt capturedAt capturedAtRejected context soilTest';

const findOwn = async (req, fields) => {
  const owner = ownerFilter(req);
  if (!owner || !mongoose.isValidObjectId(req.params.id)) return null;
  return PredictionModel.findOne({ _id: req.params.id, ...owner }).select(fields).lean();
};

// A Soil Health Card older than the scheme's retest gap (2 years, PIB) is flagged, not ignored
export const soilTestNote = (soilTest, refDate) => (soilTest?.sampleDate
  && daysBetween(soilTest.sampleDate, refDate) > 365 * KB.soilHealthCard.retestAfterYears ? 'older_than_retest_interval' : null);

const answer = (p, snapshot, cached) => {
  const fit = contextFit(p, snapshot, p.soilTest ?? null);
  const all = [fit.diagnosed, ...fit.alternatives].filter(Boolean);
  return { context: snapshot, fit, draft: all.some((f) => f.draft), soilTest: p.soilTest ?? null,
    soilTestNote: soilTestNote(p.soilTest, snapshot.reference.date), cached };
};

// @route  GET /api/predict/:id/context   (owner only; docs/CONTEXT_LAYER.md)
// The first call builds the snapshot and stores it on the checkup; every later call only reads it. The
// exact location is read here and goes nowhere but the geo-service (a ~250 m cell, in a POST body) and
// Open-Meteo (a 0.05° grid point, as for the risk strip). No coordinates in the answer or the logs.
export const getContext = async (req, res) => {
  try {
    const p = await findOwn(req, FIELDS);
    if (!p) return res.status(404).json({ message: 'Prediction not found' });
    if (!p.location) return res.status(409).json({ message: 'This checkup has no location' });
    if (!['ok', 'uncertain'].includes(p.status)) return res.status(409).json({ message: 'This checkup has no diagnosis' });
    if (p.context?.version === CONTEXT_VERSION) return res.json(answer(p, p.context, true));
    if (!process.env.GEO_SERVICE_URL) return res.status(503).json({ message: 'Environment context is not available' });

    const start = performance.now();
    let snapshot;
    try {
      snapshot = await buildSnapshot(p, { requestId: req.id });
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      logger.error({ requestId: req.id, part: err.what, upstreamStatus: err.upstreamStatus, code: err.code }, 'context upstream failed');
      return err.status === 503
        ? res.status(503).json({ message: 'The satellite service is busy. Please try again later.' })
        : res.status(502).json({ message: err.what === 'weather'
          ? 'Weather data is unavailable right now. Please try again shortly.'
          : 'Soil and rainfall data are unavailable right now. Please try again shortly.' });
    }
    // immutable: store only if no current snapshot got there first (two tabs opening the same checkup)
    const { modifiedCount } = await PredictionModel.updateOne(
      { _id: p._id, 'context.version': { $ne: CONTEXT_VERSION } }, { $set: { context: snapshot } });
    if (!modifiedCount) snapshot = (await PredictionModel.findById(p._id).select('context').lean()).context;
    const body = answer(p, snapshot, false);
    logger.info({ requestId: req.id, crop: p.crop, reference: snapshot.reference.source, weather: snapshot.weather.source,
      rain: snapshot.rainAnomaly.status, soil: Boolean(snapshot.soil), fit: body.fit.diagnosed?.level ?? null,
      geoParts: snapshot.provenance.geoParts, contextMs: Math.round(performance.now() - start) }, 'context');
    res.json(body);
  } catch (error) {
    logError(req, 'Context failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Soil Health Card values the farmer types in (docs/DISEASE_RULES.md): numbers and the sample date only,
// never the card number, name or phone. Ranges are generous plausibility limits, not agronomy.
export const SOIL_TEST_FIELDS = {
  ph: [3, 11], ec: [0, 20], ocPct: [0, 10], availableN: [0, 2000], availableP: [0, 500], availableK: [0, 3000],
  s: [0, 500], zn: [0, 100], fe: [0, 500], cu: [0, 100], mn: [0, 500], b: [0, 50],
};

export function parseSoilTest(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the soil test values as JSON' };
  const unknown = Object.keys(body).filter((k) => !(k in SOIL_TEST_FIELDS) && k !== 'sampleDate');
  if (unknown.length) return { error: `Unknown field(s): ${unknown.join(', ')}` };
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(SOIL_TEST_FIELDS)) {
    if (body[k] == null || body[k] === '') continue;
    const v = typeof body[k] === 'string' ? Number(body[k]) : body[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return { error: `${k} must be a number from ${lo} to ${hi}` };
    out[k] = v;
  }
  if (!Object.keys(out).length) return { error: 'Enter at least one value from the card' };
  const d = body.sampleDate;
  if (d != null && d !== '') {
    if (!isIsoDate(d) || d > istDate(now) || d < '2015-01-01') {
      return { error: 'sampleDate must be a date from 2015 (when the scheme began) to today' };
    }
    out.sampleDate = d;
  }
  return { soilTest: { ...out, enteredAt: now.toISOString() } };
}

// @route  PATCH /api/predict/:id/soil-test   (owner only) replaces the card values; the answer is the new fit
export const putSoilTest = async (req, res) => {
  try {
    const { soilTest, error } = parseSoilTest(req.body);
    if (error) return res.status(400).json({ message: error });
    const p = await findOwn(req, FIELDS);
    if (!p) return res.status(404).json({ message: 'Prediction not found' });
    await PredictionModel.updateOne({ _id: p._id }, { $set: { soilTest } });
    logger.info({ requestId: req.id, crop: p.crop, fields: Object.keys(soilTest).filter((k) => k !== 'enteredAt') }, 'soil test');
    if (!p.context) return res.json({ soilTest, fit: null });
    res.json(answer({ ...p, soilTest }, p.context, true));
  } catch (error) {
    logError(req, 'Soil test failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
