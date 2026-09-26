import { createHash } from "node:crypto";
import mongoose from "mongoose";

export const FIELD_DAYS = 120; // Sentinel-2 history shown: about one crop season up to the checkup

// location rounded to 4 decimals (~11 m, inside one field circle), with window and crop, hashed
export const fieldCacheKey = (lat, lon, date, crop) =>
  createHash('sha256').update([lat.toFixed(4), lon.toFixed(4), date, FIELD_DAYS, crop].join('|')).digest('hex');

// key for a stored prediction (location [lon, lat], its date and crop)
export const keyForPrediction = (p) =>
  fieldCacheKey(p.location.coordinates[1], p.location.coordinates[0], p.createdAt.toISOString().slice(0, 10), p.crop);

// Field-health answers from the geo-service, so a repeat view costs no Earth Engine quota. The key is a
// SHA-256 of the rounded location + window + crop: the cache holds no readable coordinates.
const fieldHealthCacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
    // expire after 30 days (the window ends on the checkup's date, so later images never change it)
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

export default mongoose.models.FieldHealthCache || mongoose.model('FieldHealthCache', fieldHealthCacheSchema);
