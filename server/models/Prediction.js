import mongoose from "mongoose";

const predictionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    crop: {
        type: String,
        required: true,
        enum: ['wheat', 'potato', 'mustard', 'sugarcane']
    },
    disease: {
        type: String,
        required: true
    },
    confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 1
    },
    severity: {
        type: String,
        required: true,
        enum: ['early', 'moderate', 'severe']
    },
    yieldLossPercent: {
        type: Number,
        default: null
    },
    treatment: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const PredictionModel = mongoose.models.Prediction || mongoose.model('Prediction', predictionSchema);

export default PredictionModel;