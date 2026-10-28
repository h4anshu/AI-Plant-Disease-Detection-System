import mongoose from "mongoose";

// Official warnings kept for the weather alerts (docs/FIELD_ALERTS.md, "Official warnings"):
// - OfficialAlert: one NDMA SACHET (CAP 1.2) alert as received, parsed by services/alerts/cap.js. Deleted a day after it expires.
//   An Update or Cancel marks what it references as superseded instead of deleting it: the older item is still in the feed and
//   would otherwise be fetched, and shown, again.
// - ImdWarning: IMD's latest 5-day warning of one district (the layer is replaced every few hours).
// - SourceHealth: how fresh each source is (read by the screen and by GET /api/alerts/health), plus the lease that keeps two
//   server instances from fetching the same source at the same time.
const officialAlertSchema = new mongoose.Schema({
    identifier: { type: String, required: true, unique: true },
    guid: { type: String, index: true },          // the RSS item id: "already fetched" is checked with it
    sender: String,
    sent: Date,
    status: String,
    scope: String,
    msgType: String,                              // Alert | Update | Cancel
    references: { type: [String], index: true },  // identifiers this message replaces or cancels
    supersededBy: { type: String, default: null }, // the Update or Cancel that replaced this alert: kept (so it is not fetched again), never shown
    severity: String,                             // CAP: Extreme | Severe | Moderate | Minor | Unknown
    urgency: String,
    certainty: String,
    event: String,
    onset: Date,
    expires: { type: Date, required: true, index: { expireAfterSeconds: 86400 } },
    lgd: { type: [Number], index: true },         // LGD district codes the alert is for
    areaDesc: String,
    infos: [{ _id: false, language: String, headline: String, instruction: String }],
    fetchedAt: Date
});

const imdWarningSchema = new mongoose.Schema({
    imdId: { type: Number, required: true, unique: true },
    name: String,
    updatedAt: Date,                              // when IMD updated this district (layer attribute `updated_at`)
    days: [{ _id: false, n: Number, color: Number, codes: [Number] }], // n = Day_1..Day_5; color 1 red, 2 orange, 3 yellow, 4 green
    fetchedAt: Date
});

const sourceHealthSchema = new mongoose.Schema({
    source: { type: String, required: true, unique: true },
    attemptedAt: Date,
    fetchedAt: Date,                              // last SUCCESSFUL fetch
    newestItemAt: Date,
    recordCount: Number,
    errorReason: { type: String, default: null },
    leaseUntil: Date
});

export const OfficialAlert = mongoose.models.OfficialAlert || mongoose.model('OfficialAlert', officialAlertSchema);
export const ImdWarning = mongoose.models.ImdWarning || mongoose.model('ImdWarning', imdWarningSchema);
export const SourceHealth = mongoose.models.SourceHealth || mongoose.model('SourceHealth', sourceHealthSchema);
