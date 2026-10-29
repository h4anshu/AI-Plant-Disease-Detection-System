import mongoose from "mongoose";

// A browser's push subscription (docs/PUSH.md). Owned like a checkup (userId + deviceId), so "Delete my data", "Delete my account" and
// "add this browser's records to my account" reach it. The endpoint is a secret URL of the browser's push service; the two keys encrypt what
// is sent. `sent` holds the alerts this browser was already told about (id and level), so a warning is sent once, and again only when it gets worse.
// It is dropped after 180 days without the app syncing it (a phone that no longer opens the app).
export const MAX_SUBSCRIPTIONS = 5; // per owner: a phone, a tablet, a laptop...
export const SENT_KEPT = 60;

const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    deviceId: { type: String, default: null, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 600 },
    keys: { p256dh: { type: String, required: true, maxlength: 200 }, auth: { type: String, required: true, maxlength: 200 } },
    lang: { type: String, default: 'en', maxlength: 8 },
    sent: { type: [String], default: [] },
    failures: { type: Number, default: 0 },
    lastSentAt: Date,
    seenAt: { type: Date, default: Date.now, expires: 180 * 86400 },
}, { timestamps: true });
schema.index({ userId: 1 });

export default mongoose.models.PushSubscription || mongoose.model('PushSubscription', schema);
