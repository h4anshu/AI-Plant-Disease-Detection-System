import mongoose from "mongoose";

// SoilGrids answers per ~250 m cell (utils/context.js soilCacheKey): the maps are static, so no expiry. The key
// is a SHA-256 of the snapped cell, never readable coordinates; "Delete my data" removes the user's cells.
// result.soil is null where SoilGrids has no data (water, towns), so those cells are not asked twice either.
const soilCacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.SoilCache || mongoose.model('SoilCache', soilCacheSchema);
