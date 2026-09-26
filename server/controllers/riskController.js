import mongoose from "mongoose";
import PredictionModel from "../models/Prediction.js";
import { ownerFilter } from "./predictController.js";
import { assess, RISK_CROPS } from "../utils/diseaseRisk.js";
import { ATTRIBUTION, getWeather, localToday } from "../services/openMeteo.js";
import logger, { logError } from "../utils/logger.js";

const answer = async (req, res, lat, lon, crop) => {
  let weather;
  try {
    weather = await getWeather(lat, lon);
  } catch (err) {
    logger.error({ requestId: req.id, status: err.response?.status ?? null, code: err.code ?? null }, 'Open-Meteo call failed');
    return res.status(502).json({ message: 'Weather data is unavailable right now. Please try again shortly.' });
  }
  const result = assess(crop, weather, localToday(weather.utcOffsetSeconds));
  logger.info({ requestId: req.id, crop, levels: result.days.map((d) => d.level) }, 'disease risk');
  res.json({ ...result, weatherSource: ATTRIBUTION, timezone: weather.timezone });
};

// @route  GET /api/disease-risk?lat=&lon=&crop=potato|rice   (public: the map page asks for its centre)
export const getRisk = async (req, res) => {
  try {
    const { crop } = req.query;
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!RISK_CROPS.includes(crop)) return res.status(400).json({ message: `crop must be one of ${RISK_CROPS.join(', ')}` });
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ message: 'Invalid location' });
    }
    await answer(req, res, lat, lon, crop);
  } catch (error) {
    logError(req, 'Disease risk failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/predict/:id/disease-risk   (the result page: the checkup's own private location)
export const getPredictionRisk = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Prediction not found' });
    const p = await PredictionModel.findOne({ _id: req.params.id, ...owner }).select('location crop').lean();
    if (!p) return res.status(404).json({ message: 'Prediction not found' });
    if (!RISK_CROPS.includes(p.crop)) return res.status(422).json({ message: 'No risk model for this crop yet' });
    if (!p.location) return res.status(409).json({ message: 'This checkup has no location' });
    const [lon, lat] = p.location.coordinates;
    await answer(req, res, lat, lon, p.crop);
  } catch (error) {
    logError(req, 'Disease risk failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
