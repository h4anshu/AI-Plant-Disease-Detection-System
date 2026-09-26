import axios from "axios";
import mongoose from "mongoose";
import FormData from "form-data";
import { uploadBuffer } from "../config/cloudinary.js";
import PredictionModel, { FEEDBACK } from "../models/Prediction.js";
import { getTreatment, LANGUAGES, localizedTreatment, treatmentMap } from "../utils/treatmentMap.js";
import getYieldLoss from "../utils/yieldLoss.js";
import { BadImage, cleanImage } from "../utils/image.js";
import { GUEST_ID } from "../middleware/guestDevice.js";
import logger, { logError } from "../utils/logger.js";

// Treatment advice in the language the browser asked for (Accept-Language), English when there is no
// translation. MongoDB always keeps the English text; the other fields never change with the language.
const withLanguage = (req, res, doc) => {
  const lang = req.acceptsLanguages(...LANGUAGES) || 'en';
  res.vary('Accept-Language');
  const obj = doc.toObject ? doc.toObject() : doc;
  if (!obj.treatment || lang === 'en') return obj;
  const t = localizedTreatment(obj.crop, obj.disease, lang);
  res.set('Content-Language', t.lang);
  return { ...obj, treatment: t.text, treatmentLanguage: t.lang, treatmentNeedsReview: t.needsReview };
};

const ML_TIMEOUT_MS = 60000;
const RETRYABLE = new Set([429, 502, 503, 504]); // Cloud Run while an instance starts or is saturated

// One retry after 1 s for connection errors and gateway answers; never after our own timeout, which
// would make the user wait twice. The form is rebuilt each time: a sent form-data stream is used up.
const callML = async (image, filename, crop, requestId) => {
  for (let attempt = 1; ; attempt++) {
    const formData = new FormData();
    formData.append('file', image, { filename });
    formData.append('crop', crop);
    try {
      return await axios.post(`${process.env.FASTAPI_URL}/predict-disease`, formData, {
        headers: { ...formData.getHeaders(), 'x-ml-token': process.env.ML_SERVICE_TOKEN ?? '', 'x-request-id': requestId },
        timeout: ML_TIMEOUT_MS,
      });
    } catch (err) {
      const status = err.response?.status;
      const retryable = status ? RETRYABLE.has(status) : err.code !== 'ECONNABORTED';
      if (attempt >= 2 || !retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

// @route  POST /api/predict
const predict = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const { crop } = req.body;
    if (!crop) {
      return res.status(400).json({ message: 'Crop type is required' });
    }

    // 0. Check the real file type and size; the stored copy is downsized and has no EXIF (GPS etc.)
    let publicImage;
    try {
      publicImage = await cleanImage(req.file.buffer);
    } catch (err) {
      if (err instanceof BadImage) return res.status(400).json({ message: err.message });
      throw err;
    }

    // 1. Send image to FastAPI ML service (first, so a failed ML call leaves no orphan upload).
    // It gets the original bytes so predictions match the parity-tested pipeline exactly.
    let mlResponse;
    const mlStart = performance.now();
    try {
      mlResponse = await callML(req.file.buffer, req.file.originalname, crop, req.id);
    } catch (mlError) {
      // the ML service says the request itself is bad: tell the user; anything else is our outage
      const mlStatus = mlError.response?.status;
      if (mlStatus === 415) {
        return res.status(400).json({ message: 'The uploaded file is not a readable image' });
      }
      if (mlStatus === 400) {
        return res.status(400).json({ message: 'Unsupported crop' });
      }
      logger.error({ requestId: req.id, mlStatus: mlStatus ?? null, code: mlError.code ?? null, error: mlError.message },
        'ML service call failed');
      return res.status(502).json({ message: 'The diagnosis service is unavailable right now. Please try again shortly.' });
    }

    // status: "ok" | "uncertain" | "rejected_quality" | "not_leaf" (docs/OOD_GATE.md)
    const { status = 'ok', reasons = [], ood_score = null, quality = null, top3, model_version = null,
            disease, confidence, severity, gradcam } = mlResponse.data;

    const mlLatencyMs = Math.round(performance.now() - mlStart);

    // 2. Upload the photo and the Grad-CAM PNG to Cloudinary; MongoDB keeps only their URLs
    // (a base64 heatmap is ~100 KB, which would fill the 512 MB free Atlas cluster in ~5,000 records)
    const [imageUrl, gradcamUrl] = await Promise.all([
      uploadBuffer(publicImage, 'plant-disease'),
      gradcam ? uploadBuffer(Buffer.from(gradcam, 'base64'), 'plant-disease/gradcam') : null,
    ]);

    // 3-4. Treatment advice and yield loss only for a confident diagnosis
    const isOk = status === 'ok';
    const treatment = isOk ? getTreatment(crop, disease) : null;
    const yieldLossPercent = isOk ? getYieldLoss(crop, disease, severity) : null;

    // 5. Save prediction to MongoDB
    const prediction = await PredictionModel.create({
      userId: req.user.id,
      deviceId: req.deviceId,
      imageUrl,
      crop,
      status,
      reasons,
      oodScore: ood_score,
      quality,
      top3,
      modelVersion: model_version,
      disease,
      confidence,
      severity,
      yieldLossPercent,
      treatment,
      gradcam: gradcamUrl
    });

    // what the drift report and dashboards need; never the image, its URL or who sent it
    logger.info({ requestId: req.id, crop, status, disease: disease ?? null, confidence: confidence ?? null,
      diseaseSeverity: severity ?? null, oodScore: ood_score, modelVersion: model_version, mlLatencyMs }, 'prediction');

    // 6. Return full result to frontend
    res.status(201).json(withLanguage(req, res, prediction));

  } catch (error) {
    logError(req, 'Predict failed', error);
    res.status(500).json({ message: 'Prediction failed' });  // details stay in the server log
  }
};

const PAGE_SIZE = 50;

// guests only reach their own browser's records (middleware/guestDevice.js); null = nothing of theirs
const ownerFilter = (req) => {
  if (req.user.id !== GUEST_ID) return { userId: req.user.id };
  return req.deviceId ? { userId: GUEST_ID, deviceId: req.deviceId } : null;
};

// @route  GET /api/predict?before=<createdAt of the last record shown>  (newest first, 50 per page)
const getHistory = async (req, res) => {
  try {
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && isNaN(before)) return res.status(400).json({ message: 'Invalid before date' });
    const filter = ownerFilter(req);
    if (!filter) return res.status(200).json([]);
    if (before) filter.createdAt = { $lt: before };
    // the list never shows the heatmap, and records from before the migration hold it as ~100 KB base64
    const predictions = await PredictionModel.find(filter).select('-gradcam').sort({ createdAt: -1 }).limit(PAGE_SIZE);
    res.status(200).json(predictions.map((p) => withLanguage(req, res, p)));
  } catch (error) {
    logError(req, 'History failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  GET /api/predict/classes -> { crop: [class, ...] }, the choices for "what was it really?"
// (the treatment map has exactly the ML label maps' classes; tests/feedback.test.js checks that)
const getClasses = (req, res) => {
  res.json(Object.fromEntries(Object.entries(treatmentMap).map(([crop, t]) => [crop, Object.keys(t)])));
};

// @route  PATCH /api/predict/:id/feedback  { feedback: correct|incorrect|unsure, correctedLabel? }
// Answering again replaces the earlier answer.
const giveFeedback = async (req, res) => {
  try {
    const { feedback, correctedLabel = null } = req.body ?? {};
    if (!FEEDBACK.includes(feedback)) {
      return res.status(400).json({ message: `feedback must be one of ${FEEDBACK.join(', ')}` });
    }
    const owner = ownerFilter(req);
    if (!owner || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Prediction not found' });
    const prediction = await PredictionModel.findOne({ _id: req.params.id, ...owner });
    if (!prediction) return res.status(404).json({ message: 'Prediction not found' });

    if (feedback === 'incorrect') {
      const choices = [...Object.keys(treatmentMap[prediction.crop] ?? {}), 'Other'];
      if (!choices.includes(correctedLabel)) {
        return res.status(400).json({ message: 'correctedLabel must be one of the crop\'s classes or "Other"' });
      }
    } else if (correctedLabel !== null) {
      return res.status(400).json({ message: 'correctedLabel is only allowed with feedback "incorrect"' });
    }

    prediction.feedback = feedback;
    prediction.correctedLabel = feedback === 'incorrect' ? correctedLabel : null;
    prediction.feedbackAt = new Date();
    await prediction.save();
    logger.info({ requestId: req.id, crop: prediction.crop, status: prediction.status,
      predicted: prediction.disease ?? null, feedback, correctedLabel: prediction.correctedLabel,
      modelVersion: prediction.modelVersion }, 'feedback');
    res.json({ _id: prediction._id, feedback, correctedLabel: prediction.correctedLabel, feedbackAt: prediction.feedbackAt });
  } catch (error) {
    logError(req, 'Feedback failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export { predict, getHistory, getClasses, giveFeedback };