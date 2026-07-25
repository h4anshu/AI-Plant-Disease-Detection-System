import axios from "axios";
import FormData from "form-data";
import cloudinary from "../config/cloudinary.js";
import PredictionModel from "../models/Prediction.js";
import getTreatment from "../utils/treatmentMap.js";
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

    // 1. Upload image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'plant-disease' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(req.file.buffer);
    });
    const imageUrl = uploadResult.secure_url;

    // 2. Send image to FastAPI ML service for prediction
    const formData = new FormData();
    formData.append('file', req.file.buffer, { filename: req.file.originalname });

    const mlResponse = await axios.post(
      `${process.env.FASTAPI_URL}/predict-disease`,
      formData,
      { headers: formData.getHeaders() }
    );

    const { disease, confidence, severity } = mlResponse.data;

    // 3. Look up treatment advice
    const treatment = getTreatment(disease);

    // 4. Look up yield loss estimate
    const yieldLossPercent = getYieldLoss(severity);

    // 5. Save prediction to MongoDB
    const prediction = await PredictionModel.create({
      userId: req.user.id,
      imageUrl,
      crop,
      disease,
      confidence,
      severity,
      yieldLossPercent,
      treatment
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