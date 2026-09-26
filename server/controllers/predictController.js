import axios from "axios";
import FormData from "form-data";
import cloudinary from "../config/cloudinary.js";
import PredictionModel from "../models/Prediction.js";
import { getTreatment } from "../utils/treatmentMap.js";
import getYieldLoss from "../utils/yieldLoss.js";

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

    // 1. Send image to FastAPI ML service (first, so a failed ML call leaves no orphan upload)
    const formData = new FormData();
    formData.append('file', req.file.buffer, { filename: req.file.originalname });
    formData.append('crop', crop);

    const mlResponse = await axios.post(
      `${process.env.FASTAPI_URL}/predict-disease`,
      formData,
      { headers: formData.getHeaders() }
    );

    // status: "ok" | "uncertain" | "rejected_quality" | "not_leaf" (docs/OOD_GATE.md)
    const { status = 'ok', reasons = [], ood_score = null, quality = null, top3,
            disease, confidence, severity, gradcam } = mlResponse.data;

    // 2. Upload image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'plant-disease' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(req.file.buffer);
    });
    const imageUrl = uploadResult.secure_url;

    // 3-4. Treatment advice and yield loss only for a confident diagnosis
    const isOk = status === 'ok';
    const treatment = isOk ? getTreatment(crop, disease) : null;
    const yieldLossPercent = isOk ? getYieldLoss(crop, disease, severity) : null;

    // 5. Save prediction to MongoDB
    const prediction = await PredictionModel.create({
      userId: req.user.id,
      imageUrl,
      crop,
      status,
      reasons,
      oodScore: ood_score,
      quality,
      top3,
      disease,
      confidence,
      severity,
      yieldLossPercent,
      treatment,
      gradcam
    });

    // 6. Return full result to frontend
    res.status(201).json(prediction);

  } catch (error) {
    console.error('Predict error:', error.message);
    res.status(500).json({ message: 'Prediction failed', error: error.message });
  }
};

// @route  GET /api/predictions
const getHistory = async (req, res) => {
  try {
    const predictions = await PredictionModel.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(predictions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export { predict , getHistory};