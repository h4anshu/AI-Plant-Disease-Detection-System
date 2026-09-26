import axios from "axios";
import FormData from "form-data";
import { uploadBuffer } from "../config/cloudinary.js";
import PredictionModel from "../models/Prediction.js";
import { getTreatment } from "../utils/treatmentMap.js";
import getYieldLoss from "../utils/yieldLoss.js";
import { BadImage, cleanImage } from "../utils/image.js";
import { GUEST_ID } from "../middleware/guestDevice.js";

const ML_TIMEOUT_MS = 60000;
const RETRYABLE = new Set([429, 502, 503, 504]); // Cloud Run while an instance starts or is saturated

// One retry after 1 s for connection errors and gateway answers; never after our own timeout, which
// would make the user wait twice. The form is rebuilt each time: a sent form-data stream is used up.
const callML = async (image, filename, crop) => {
  for (let attempt = 1; ; attempt++) {
    const formData = new FormData();
    formData.append('file', image, { filename });
    formData.append('crop', crop);
    try {
      return await axios.post(`${process.env.FASTAPI_URL}/predict-disease`, formData, {
        headers: { ...formData.getHeaders(), 'x-ml-token': process.env.ML_SERVICE_TOKEN ?? '' },
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
    try {
      mlResponse = await callML(req.file.buffer, req.file.originalname, crop);
    } catch (mlError) {
      // the ML service says the request itself is bad: tell the user; anything else is our outage
      const mlStatus = mlError.response?.status;
      if (mlStatus === 415) {
        return res.status(400).json({ message: 'The uploaded file is not a readable image' });
      }
      if (mlStatus === 400) {
        return res.status(400).json({ message: 'Unsupported crop' });
      }
      console.error('ML service error:', mlStatus ?? mlError.code, mlError.message);
      return res.status(502).json({ message: 'The diagnosis service is unavailable right now. Please try again shortly.' });
    }

    // status: "ok" | "uncertain" | "rejected_quality" | "not_leaf" (docs/OOD_GATE.md)
    const { status = 'ok', reasons = [], ood_score = null, quality = null, top3, model_version = null,
            disease, confidence, severity, gradcam } = mlResponse.data;

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

    // 6. Return full result to frontend
    res.status(201).json(prediction);

  } catch (error) {
    console.error('Predict error:', error.message);
    res.status(500).json({ message: 'Prediction failed' });  // details stay in the server log
  }
};

const PAGE_SIZE = 50;

// @route  GET /api/predict?before=<createdAt of the last record shown>  (newest first, 50 per page)
const getHistory = async (req, res) => {
  try {
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && isNaN(before)) return res.status(400).json({ message: 'Invalid before date' });
    // guests only see their own browser's records (middleware/guestDevice.js); no device id = no history
    if (req.user.id === GUEST_ID && !req.deviceId) return res.status(200).json([]);
    const filter = req.user.id === GUEST_ID ? { userId: GUEST_ID, deviceId: req.deviceId } : { userId: req.user.id };
    if (before) filter.createdAt = { $lt: before };
    // the list never shows the heatmap, and records from before the migration hold it as ~100 KB base64
    const predictions = await PredictionModel.find(filter).select('-gradcam').sort({ createdAt: -1 }).limit(PAGE_SIZE);
    res.status(200).json(predictions);
  } catch (error) {
    console.error('History error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export { predict , getHistory};