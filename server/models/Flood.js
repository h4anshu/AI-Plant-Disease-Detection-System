import { createHash } from "node:crypto";
import mongoose from "mongoose";

// Flood data for the weather alerts (docs/FIELD_ALERTS.md, "Flood"):
// - FloodForecast: Open-Meteo's river-discharge forecast for the 5 points around one 0.05° cell, kept 6 hours (it updates daily).
// - FloodClimate: the 90th, 95th and 99th percentile of each point's discharge in the 1984-2022 reanalysis, computed once per cell.
//   An alert is "unusually high for this river", never an absolute number.
// - CwcStation: a Central Water Commission river gauge, with its status when it is above its warning level (services/alerts/cwc.js).
const forecastSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 6 }
});

const climateSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    points: [{ _id: false, p90: Number, p95: Number, p99: Number, n: Number }],
    createdAt: { type: Date, default: Date.now }
});

const stationSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },   // lower case: the two CWC lists spell it differently
    name: String,
    type: String,                                           // Level | Inflow
    loc: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: [Number] }, // [lon, lat]
    status: { type: String, default: null },                // WARNING | DANGER while above its warning level, else null
    trend: { type: String, default: null },
    statusAt: Date,
    fetchedAt: Date
});
stationSchema.index({ loc: '2dsphere' });

// The radar flood-extent answer of the geo-service for one place and one day (an Earth Engine call each, so a repeat view is free).
// Hashed key: no readable location. Kept 3 days (the satellites pass every 6 to 12 days).
const extentSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 3 }
});

export const FloodForecast = mongoose.models.FloodForecast || mongoose.model('FloodForecast', forecastSchema);
export const FloodClimate = mongoose.models.FloodClimate || mongoose.model('FloodClimate', climateSchema);
// the cache key of one place and day: a hash of the place rounded to about 100 m, so it is deleted with the field that made it ("Delete my data")
export const extentKey = (lat, lon, day) => createHash('sha256').update(['extent1', lat.toFixed(3), lon.toFixed(3), day].join('|')).digest('hex');

export const FloodExtentCache = mongoose.models.FloodExtentCache || mongoose.model('FloodExtentCache', extentSchema);
export const CwcStation = mongoose.models.CwcStation || mongoose.model('CwcStation', stationSchema);
