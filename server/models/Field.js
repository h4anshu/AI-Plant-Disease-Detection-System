import mongoose from "mongoose";
import { CROPS } from "./Prediction.js";
import { STAGES } from "../utils/alertRules.js";

export const MAX_FIELDS = 3; // per browser or user
export const MAX_NAME = 40;

// A saved field for the weather alerts (docs/FIELD_ALERTS.md). Owned like a checkup: signed-in users by
// userId, guests by their browser's deviceId (middleware/guestDevice.js). The exact point is private: no API
// returns it (controllers/fieldController.js toResponse); weather is asked for its 0.05° grid cell only.
const fieldSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, default: null, index: true },
    name: { type: String, default: '', maxlength: MAX_NAME, trim: true },
    crop: { type: String, required: true, enum: CROPS },
    stage: { type: String, required: true, enum: STAGES },
    location: {
        type: new mongoose.Schema({
            type: { type: String, enum: ['Point'], required: true },
            coordinates: { type: [Number], required: true } // [lon, lat]
        }, { _id: false }),
        required: true
    },
    // The districts under the field's 0.05° cell, from IMD's point query (services/alerts/ingest.js ensureDistricts). Absent until
    // looked up; `imd` are warning-layer rows, `lgd` the matching SACHET district codes. Never returned by the API.
    district: {
        type: new mongoose.Schema({
            imd: [{ _id: false, id: Number, name: String }],
            lgd: [{ _id: false, code: Number, name: String, state: String }],
            at: Date
        }, { _id: false }),
        default: undefined
    },
    districtTriedAt: Date
}, { timestamps: true });

const FieldModel = mongoose.models.Field || mongoose.model('Field', fieldSchema);

export default FieldModel;
