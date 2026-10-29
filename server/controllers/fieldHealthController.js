import axios from "axios";
import mongoose from "mongoose";
import PredictionModel from "../models/Prediction.js";
import FieldModel from "../models/Field.js";
import FieldHealthCache, { FIELD_DAYS, fieldCacheKey, keyForPrediction } from "../models/FieldHealthCache.js";
import { ownerFilter } from "./predictController.js";
import { countUsage } from "../services/usage.js";
import logger, { logError } from "../utils/logger.js";

const GEO_TIMEOUT_MS = 90000; // Earth Engine answers in 2-30 s; cold start adds a few

// The geo-service's answer for a place, from the cache when there is one (a repeat view costs no Earth Engine quota). The place goes to the
// geo-service in a POST body only; the answer holds no coordinates. Sends the response itself.
async function answerHealth(req, res, { lat, lon, date, crop, key }) {
  const cached = await FieldHealthCache.findOne({ key }).lean();
  if (cached) return res.json({ ...cached.result, cached: true });

  const start = performance.now();
  let data;
  try {
    ({ data } = await axios.post(`${process.env.GEO_SERVICE_URL}/field-health`,
      { lat, lon, date, days: FIELD_DAYS, crop },
      { headers: { 'x-geo-token': process.env.GEO_SERVICE_TOKEN ?? '', 'x-request-id': req.id }, timeout: GEO_TIMEOUT_MS }));
  } catch (err) {
    const status = err.response?.status;
    logger.error({ requestId: req.id, geoStatus: status ?? null, code: err.code ?? null, error: err.message }, 'geo-service call failed');
    return status === 503
      ? res.status(503).json({ message: 'The satellite service is busy. Please try again later.' })
      : res.status(502).json({ message: 'Satellite data is unavailable right now. Please try again shortly.' });
  }
  await countUsage('earth-engine-health');
  await FieldHealthCache.updateOne({ key }, { $set: { result: data, createdAt: new Date() } }, { upsert: true });
  logger.info({ requestId: req.id, crop, flag: data.flag?.code, clearImages: data.clear_images,
    geoLatencyMs: Math.round(performance.now() - start) }, 'field health');
  res.json({ ...data, cached: false });
}

// @route  GET /api/predict/:id/field-health
// How the diagnosed field looks from space (docs/FIELD_HEALTH.md). Only for the owner of the checkup,
// only when it has a consented location; the coordinates are read from MongoDB here and never leave
// the server except to the geo-service, in a POST body. The answer holds no coordinates.
export const getFieldHealth = async (req, res) => {
  try {
    if (!process.env.GEO_SERVICE_URL) return res.status(503).json({ message: 'Field health is not available' });
    const owner = ownerFilter(req);
    if (!owner || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Prediction not found' });
    const prediction = await PredictionModel.findOne({ _id: req.params.id, ...owner }).select('location crop createdAt').lean();
    if (!prediction) return res.status(404).json({ message: 'Prediction not found' });
    if (!prediction.location) return res.status(409).json({ message: 'This checkup has no location' });

    const [lon, lat] = prediction.location.coordinates;
    await answerHealth(req, res, { lat, lon, date: prediction.createdAt.toISOString().slice(0, 10), crop: prediction.crop, key: keyForPrediction(prediction) });
  } catch (error) {
    logError(req, 'Field health failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/fields/:id/health
// The same view for a SAVED field (docs/CROP_HEALTH.md): the crop's vegetation index over the last 120 days against the fields around it,
// from Sentinel-2. Only for the owner, on request (each uncached answer is an Earth Engine computation), cached per place and day.
export const getSavedFieldHealth = async (req, res) => {
  try {
    if (!process.env.GEO_SERVICE_URL) return res.status(503).json({ message: 'Crop health from space is not available' });
    const owner = ownerFilter(req);
    if (!owner || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Field not found' });
    const field = await FieldModel.findOne({ _id: req.params.id, ...owner }).select('location crop').lean();
    if (!field) return res.status(404).json({ message: 'Field not found' });

    const [lon, lat] = field.location.coordinates;
    const date = new Date().toISOString().slice(0, 10);
    await answerHealth(req, res, { lat, lon, date, crop: field.crop, key: fieldCacheKey(lat, lon, date, field.crop) });
  } catch (error) {
    logError(req, 'Saved field health failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
