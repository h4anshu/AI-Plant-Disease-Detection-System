import axios from "axios";
import mongoose from "mongoose";
import PredictionModel from "../models/Prediction.js";
import FieldHealthCache, { FIELD_DAYS, keyForPrediction } from "../models/FieldHealthCache.js";
import { ownerFilter } from "./predictController.js";
import logger, { logError } from "../utils/logger.js";

const GEO_TIMEOUT_MS = 90000; // Earth Engine answers in 2-30 s; cold start adds a few

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
    const date = prediction.createdAt.toISOString().slice(0, 10);
    const key = keyForPrediction(prediction);
    const cached = await FieldHealthCache.findOne({ key }).lean();
    if (cached) return res.json({ ...cached.result, cached: true });

    const start = performance.now();
    let data;
    try {
      ({ data } = await axios.post(`${process.env.GEO_SERVICE_URL}/field-health`,
        { lat, lon, date, days: FIELD_DAYS, crop: prediction.crop },
        { headers: { 'x-geo-token': process.env.GEO_SERVICE_TOKEN ?? '', 'x-request-id': req.id }, timeout: GEO_TIMEOUT_MS }));
    } catch (err) {
      const status = err.response?.status;
      logger.error({ requestId: req.id, geoStatus: status ?? null, code: err.code ?? null, error: err.message }, 'geo-service call failed');
      return status === 503
        ? res.status(503).json({ message: 'The satellite service is busy. Please try again later.' })
        : res.status(502).json({ message: 'Satellite data is unavailable right now. Please try again shortly.' });
    }
    await FieldHealthCache.updateOne({ key }, { $set: { result: data, createdAt: new Date() } }, { upsert: true });
    logger.info({ requestId: req.id, crop: prediction.crop, flag: data.flag?.code, clearImages: data.clear_images,
      geoLatencyMs: Math.round(performance.now() - start) }, 'field health');
    res.json({ ...data, cached: false });
  } catch (error) {
    logError(req, 'Field health failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
