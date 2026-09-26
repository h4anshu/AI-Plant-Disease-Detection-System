import PredictionModel from "../models/Prediction.js";
import { treatmentMap } from "../utils/treatmentMap.js";
import { cellPolygon, H3_RESOLUTION, MIN_DEVICES, WINDOWS } from "../utils/geo.js";
import { logError } from "../utils/logger.js";

const DAY = 86_400_000;

// Demo points (scripts/seed_demo_map.js) only on a local, non-production server that asks for them
const includeDemo = () => process.env.MAP_INCLUDE_DEMO === 'true' && process.env.NODE_ENV !== 'production';

// @route  GET /api/map/reports?crop=&disease=&days=7|30|90  (public)
// Disease reports per H3 hexagon as GeoJSON. Counts confident diagnoses ("ok"), healthy leaves only when
// asked for by name. A hexagon is returned only when at least MIN_DEVICES different browsers reported
// in it (guests without a device id count as one), and never with a raw point or a device count.
export const getReports = async (req, res) => {
  try {
    const days = req.query.days === undefined ? 30 : Number(req.query.days);
    if (!WINDOWS.includes(days)) return res.status(400).json({ message: `days must be one of ${WINDOWS.join(', ')}` });
    const { crop, disease } = req.query;
    if ([crop, disease].some((v) => v !== undefined && typeof v !== 'string')) { // ?crop=a&crop=b is an array
      return res.status(400).json({ message: 'crop and disease must be single values' });
    }
    if (crop !== undefined && !Object.hasOwn(treatmentMap, crop)) return res.status(400).json({ message: 'Unknown crop' });
    if (disease !== undefined && !(crop && Object.hasOwn(treatmentMap[crop], disease))) {
      return res.status(400).json({ message: 'Unknown disease for this crop' });
    }

    const demo = includeDemo();
    const match = {
      geoCell: { $type: 'string' },
      status: 'ok',
      createdAt: { $gte: new Date(Date.now() - days * DAY) },
      disease: disease ?? { $not: /healthy/i },
      ...(crop && { crop }),
      ...(!demo && { demo: { $ne: true } }),
    };
    const cells = await PredictionModel.aggregate([
      { $match: match },
      { $group: { _id: '$geoCell', reports: { $sum: 1 },
        devices: { $addToSet: { $ifNull: ['$deviceId', { $toString: '$userId' }] } } } },
      { $match: { [`devices.${MIN_DEVICES - 1}`]: { $exists: true } } }, // >= MIN_DEVICES distinct browsers
      { $project: { _id: 1, reports: 1 } },
      { $sort: { reports: -1 } },
    ]);

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      type: 'FeatureCollection',
      features: cells.map((c) => ({ type: 'Feature', geometry: cellPolygon(c._id), properties: { reports: c.reports } })),
      meta: { days, crop: crop ?? null, disease: disease ?? null, resolution: H3_RESOLUTION, minDevices: MIN_DEVICES, demo },
    });
  } catch (error) {
    logError(req, 'Map reports failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
