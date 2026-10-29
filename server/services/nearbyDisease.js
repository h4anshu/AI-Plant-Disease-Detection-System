import mongoose from "mongoose";
import { gridDisk, latLngToCell } from "h3-js";
import PredictionModel from "../models/Prediction.js";
import { H3_RESOLUTION, MIN_DEVICES } from "../utils/geo.js";
import { addDays, istDate } from "../utils/context.js";
import { reviewStatusOf } from "../utils/alertRules.js";

// "Disease reports near you" (docs/FIELD_ALERTS.md, "Phase 6"): the public disease map's own data, asked about the ring of H3 cells (res 7)
// around a field. Same privacy rule as the map: a disease counts only when at least MIN_DEVICES different browsers reported it, and the
// field's own browser never counts toward it. The answer holds a disease and a number, never a cell or a place.
const RING = 2;            // 19 cells, about 5 km around the field
const WINDOW_DAYS = 14;
const WATCH_DEVICES = 6;   // ours; fewer is "good to know"
const DAY = 86_400_000;

// -> an alert shaped like the weather rules' (client/src/components/workspace/alertParts.jsx), or null
// `owner` is the asker's ownerFilter: { userId, deviceId } for a guest browser, { userId } for an account. Their own reports are left out.
export async function nearbyDisease(field, owner, now = new Date()) {
  const own = owner?.deviceId ? { deviceId: { $ne: owner.deviceId } }
    : owner?.userId ? { userId: { $ne: new mongoose.Types.ObjectId(owner.userId) } } : {};   // an aggregation does not cast the id for us
  const [lon, lat] = field.location.coordinates;
  const cells = gridDisk(latLngToCell(lat, lon, H3_RESOLUTION), RING);
  const [top] = await PredictionModel.aggregate([
    { $match: { geoCell: { $in: cells }, crop: field.crop, status: 'ok', demo: { $ne: true }, disease: { $not: /healthy/i },
      createdAt: { $gte: new Date(now.getTime() - WINDOW_DAYS * DAY) }, ...own } },
    { $group: { _id: '$disease', devices: { $addToSet: { $ifNull: ['$deviceId', { $toString: '$userId' }] } } } },
    { $project: { devices: { $size: '$devices' } } },
    { $match: { devices: { $gte: MIN_DEVICES } } },
    { $sort: { devices: -1, _id: 1 } },
    { $limit: 1 },
  ]);
  if (!top) return null;
  const today = istDate(now);
  return {
    id: `DISEASE-NEAR-1|${today}`, rule: 'DISEASE-NEAR-1', hazard: 'disease_near', level: top.devices >= WATCH_DEVICES ? 'watch' : 'info',
    date: today, offset: 0, from: `${today}T00:00`, to: `${addDays(today, 1)}T00:00`,
    values: { metric: 'reports', value: top.devices, window: WINDOW_DAYS, radiusKm: 5 }, disease: top._id,
    stage: field.stage, crop: field.crop, confidence: 'low', reviewStatus: reviewStatusOf('DISEASE-NEAR-1'),
  };
}
