import { randomBytes } from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import sharp from "sharp";
import PredictionModel from "../models/Prediction.js";
import FieldHealthCache, { keyForPrediction } from "../models/FieldHealthCache.js";
import Report from "../models/Report.js";
import { ownerFilter, publicView } from "./predictController.js";
import { assess, RISK_CROPS } from "../utils/diseaseRisk.js";
import { ATTRIBUTION, getWeather, localToday } from "../services/openMeteo.js";
import { staticMap } from "../services/staticMap.js";
import { buildReport, contentHash, REPORT_LANGUAGES, sha256 } from "../utils/reportContent.js";
import { renderReport } from "../utils/reportPdf.js";
import logger, { logError } from "../utils/logger.js";

// Photo / heatmap as a JPEG PDFKit can embed. Records from before the Cloudinary migration hold base64.
async function image(src) {
  if (!src) return null;
  const raw = /^https?:/.test(src)
    ? Buffer.from((await axios.get(src, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10e6 })).data)
    : Buffer.from(src.replace(/^data:[^,]*,/, ''), 'base64');
  return sharp(raw).rotate().resize(900, 900, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

// a missing part leaves a gap in the report, never a failed report
const optional = (req, what, promise) => promise.catch((err) => {
  logger.warn({ requestId: req.id, part: what, status: err.response?.status ?? null, error: err.message }, 'report part unavailable');
  return null;
});

// @route  GET /api/predict/:id/report.pdf?lang=en|hi   (owner only, like every checkup route)
// Built from the same data the API gives the app. Never starts a satellite check: the field section
// uses a cached answer only (Earth Engine quota). Weather and the map are fetched now.
export const getReport = async (req, res) => {
  try {
    const owner = ownerFilter(req);
    if (!owner || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Prediction not found' });
    const doc = await PredictionModel.findOne({ _id: req.params.id, ...owner });
    if (!doc) return res.status(404).json({ message: 'Prediction not found' });
    if (!['ok', 'uncertain'].includes(doc.status)) return res.status(409).json({ message: 'This checkup has no diagnosis to report' });

    const start = performance.now();
    const lang = REPORT_LANGUAGES.includes(req.query.lang) ? req.query.lang : req.acceptsLanguages(...REPORT_LANGUAGES) || 'en';
    const prediction = publicView(doc, lang);
    const location = doc.location
      ? { lat: doc.location.coordinates[1], lon: doc.location.coordinates[0], accuracyM: doc.locationAccuracyM }
      : null;
    const round2 = (x) => Math.round(x * 100) / 100;

    const [photo, gradcam, map, cached, risk] = await Promise.all([
      optional(req, 'photo', image(doc.imageUrl)),
      optional(req, 'gradcam', image(doc.gradcam)),
      location ? optional(req, 'map', staticMap(round2(location.lat), round2(location.lon))) : null,
      location ? FieldHealthCache.findOne({ key: keyForPrediction(doc) }).lean() : null,
      location && RISK_CROPS.includes(doc.crop)
        ? getWeather(location.lat, location.lon)
          .then((w) => ({ ...assess(doc.crop, w, localToday(w.utcOffsetSeconds)), weatherSource: ATTRIBUTION }))
          .catch(() => ({ unavailable: true, disease: doc.crop === 'potato' ? 'late_blight' : 'blast' }))
        : null,
    ]);

    const reportId = `PG-${randomBytes(9).toString('base64url')}`;
    const generatedAt = new Date();
    const content = buildReport({
      reportId, generatedAt, lang, prediction, location, fieldHealth: cached?.result ?? null, risk,
      images: { photo: sha256(photo), gradcam: sha256(gradcam), map: sha256(map) },
      verifyUrl: `${req.protocol}://${req.get('host')}/api/reports/${reportId}`,
      watermark: process.env.REPORT_WATERMARK || null,
    });
    const hash = contentHash(content);
    const pdf = await renderReport(content, { photo, gradcam, map }, hash);

    await Report.create({ reportId, predictionId: doc._id, lang, contentSha256: hash, pdfSha256: sha256(pdf),
      summary: { crop: doc.crop, disease: doc.disease, status: doc.status, confidence: doc.confidence,
        severity: doc.severity, yieldLossPercent: doc.yieldLossPercent, yieldLossConfidence: prediction.yieldLossConfidence,
        checkupAt: doc.createdAt, modelVersion: doc.modelVersion ?? null } });

    logger.info({ requestId: req.id, crop: doc.crop, lang, bytes: pdf.length, fieldHealth: Boolean(cached),
      risk: risk ? !risk.unavailable : null, map: Boolean(map), reportMs: Math.round(performance.now() - start) }, 'report');
    res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="plantguard-report-${reportId}.pdf"` });
    res.send(pdf);
  } catch (error) {
    logError(req, 'Report failed', error);
    res.status(500).json({ message: 'Could not make the report' });
  }
};

// @route  GET /api/reports/:reportId   (public: whoever holds a report can check it)
export const verifyReport = async (req, res) => {
  try {
    const r = await Report.findOne({ reportId: String(req.params.reportId) }).lean();
    if (!r) return res.status(404).json({ message: 'No such report (or its checkup was deleted)' });
    res.json({ reportId: r.reportId, generatedAt: r.createdAt, lang: r.lang, contentSha256: r.contentSha256,
      pdfSha256: r.pdfSha256, summary: r.summary });
  } catch (error) {
    logError(req, 'Report verify failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
