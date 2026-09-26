import mongoose from "mongoose";

// status comes from the ML service's quality + out-of-distribution gate (docs/OOD_GATE.md).
// Only "ok" results are diagnoses; records saved before the gate existed read as "ok".
const STATUSES = ['ok', 'uncertain', 'rejected_quality', 'not_leaf'];
export const FEEDBACK = ['correct', 'incorrect', 'unsure'];
const hasPrediction = function () { return this.status === 'ok' || this.status === 'uncertain'; };

const predictionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // guest mode only: the browser's random id, so guests don't see each other's history
    // (middleware/guestDevice.js). null for signed-in users and for guest records saved before this.
    deviceId: {
        type: String,
        default: null,
        index: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    crop: {
        type: String,
        required: true,
        enum: ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea', 'groundnut', 'blackgram', 'apple', 'banana']
    },
    status: {
        type: String,
        enum: STATUSES,
        default: 'ok'
    },
    reasons: {
        type: [String],
        default: []
    },
    oodScore: {
        type: Number,
        default: null
    },
    quality: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // which models produced this record: backbone/head/gate versions from ml-service/models/model_registry.json
    modelVersion: {
        type: { backbone: String, head: String, gate: String, _id: false },
        default: null
    },
    top3: {
        type: [{ disease: String, probability: Number, _id: false }],
        default: undefined
    },
    disease: {
        type: String,
        required: hasPrediction
    },
    confidence: {
        type: Number,
        required: hasPrediction,
        min: 0,
        max: 1
    },
    severity: {
        type: String,
        required: hasPrediction,
        enum: ['healthy', 'early', 'moderate', 'severe']
    },
    yieldLossPercent: {
        type: Number,
        default: null
    },
    treatment: {
        type: String,
        required: function () { return this.status === 'ok'; }
    },
    gradcam: {
        type: String,
        default: null
    },
    // "Was this correct?" from the user (docs/MONITORING.md). Guest answers are unverified: they feed
    // the expert relabel queue (ml-service/train/export_relabel_queue.py), never training directly.
    feedback: {
        type: String,
        enum: [...FEEDBACK, null],
        default: null
    },
    // the user's pick from the crop's classes, or "Other"; only with feedback "incorrect"
    correctedLabel: {
        type: String,
        default: null
    },
    feedbackAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const PredictionModel = mongoose.models.Prediction || mongoose.model('Prediction', predictionSchema);

export default PredictionModel;
