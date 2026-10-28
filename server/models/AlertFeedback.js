import mongoose from "mongoose";
import { RULES } from "../utils/alertRules.js";

// "Did this help?" on an alert (docs/FIELD_ALERTS.md, "Evaluation"): one answer per browser per alert, a later answer replaces the earlier.
// It holds no place and no field: only which rule, on which date, at which level, the answer, and the field's crop and stage (so that
// a rule can be judged per crop). Owned like a checkup (userId + deviceId), so "delete my data" removes it. Kept a year.
export const ANSWERS = ['acted', 'not_needed', 'wrong'];
export const LEVELS = ['info', 'watch', 'warn', 'urgent'];
// the first part of an alert id: our own rules, and the three official sources (their identifiers are not kept)
export const KNOWN_RULES = [...RULES.map((r) => r.id), 'FLOOD-RIVER-1', 'DISEASE-NEAR-1', 'FIRE-NEAR-1', 'SACHET', 'IMD', 'CWC'];

const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    deviceId: { type: String, required: true },
    rule: { type: String, required: true, enum: KNOWN_RULES },
    alertKey: { type: String, required: true },     // "FROST-WHEAT-1|2027-02-25"; for an official alert only "SACHET|<its date>"
    level: { type: String, enum: LEVELS, required: true },
    answer: { type: String, enum: ANSWERS, required: true },
    crop: String,
    stage: String,
    createdAt: { type: Date, default: Date.now, expires: 365 * 86400 },
});
schema.index({ deviceId: 1, alertKey: 1 }, { unique: true });

export default mongoose.models.AlertFeedback || mongoose.model('AlertFeedback', schema);
