import express from "express";
import adminGuard from "../middleware/adminGuard.js";
import { adminLimiter } from "../middleware/rateLimit.js";
import User from "../models/User.js";
import Field from "../models/Field.js";
import Prediction from "../models/Prediction.js";
import PushSubscription from "../models/PushSubscription.js";
import { logError } from "../utils/logger.js";

// The operator's page (docs/ADMIN.md): how much the app is used and how often the model is right, in counts only. Nothing here names a
// person, a browser, a field or a place: no email, no id, no device id, no coordinates, no photo.
const adminRouter = express.Router();
adminRouter.use(adminLimiter, adminGuard);

const DAY = 864e5;
const since = (n) => new Date(Date.now() - n * DAY);
const real = { demo: { $ne: true } };      // seed data of a local database is never counted
const toMap = (rows, key = '_id') => Object.fromEntries(rows.map((r) => [r[key], r.n]));

adminRouter.get('/summary', async (req, res) => {
  try {
    const [users, usersWeek, fields, fieldsByCrop, checkups, checkupsWeek, checkupsMonth, byStatus, withPlace, feedback, topDiseases, push, pushByLang] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: since(7) } }),
      Field.countDocuments(),
      Field.aggregate([{ $group: { _id: '$crop', n: { $sum: 1 } } }]),
      Prediction.countDocuments(real),
      Prediction.countDocuments({ ...real, createdAt: { $gte: since(7) } }),
      Prediction.countDocuments({ ...real, createdAt: { $gte: since(30) } }),
      Prediction.aggregate([{ $match: { ...real, createdAt: { $gte: since(30) } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Prediction.countDocuments({ ...real, createdAt: { $gte: since(30) }, geoCell: { $type: 'string' } }),
      // "Was this correct?" per crop, all time. Guest answers are unverified (docs/MONITORING.md): this is the field's own opinion of the model.
      Prediction.aggregate([{ $match: { ...real, feedback: { $ne: null } } }, { $group: { _id: '$crop', answered: { $sum: 1 },
        correct: { $sum: { $cond: [{ $eq: ['$feedback', 'correct'] }, 1, 0] } }, incorrect: { $sum: { $cond: [{ $eq: ['$feedback', 'incorrect'] }, 1, 0] } },
        unsure: { $sum: { $cond: [{ $eq: ['$feedback', 'unsure'] }, 1, 0] } } } }, { $sort: { answered: -1, _id: 1 } }]),
      Prediction.aggregate([{ $match: { ...real, status: 'ok', disease: { $not: /healthy/i }, createdAt: { $gte: since(30) } } },
        { $group: { _id: { crop: '$crop', disease: '$disease' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
      PushSubscription.countDocuments(),
      PushSubscription.aggregate([{ $group: { _id: '$lang', n: { $sum: 1 } } }]),
    ]);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    res.json({
      generatedAt: new Date().toISOString(),
      users: { total: users, newThisWeek: usersWeek },
      fields: { total: fields, byCrop: toMap(fieldsByCrop) },
      checkups: { total: checkups, last7Days: checkupsWeek, last30Days: checkupsMonth, byStatusLast30Days: toMap(byStatus), withLocationLast30Days: withPlace },
      modelFeedback: {
        answered: feedback.reduce((n, r) => n + r.answered, 0),
        // "right" is correct / (correct + incorrect): an "unsure" answer says nothing either way
        rightPct: pct(feedback.reduce((n, r) => n + r.correct, 0), feedback.reduce((n, r) => n + r.correct + r.incorrect, 0)),
        byCrop: feedback.map((r) => ({ crop: r._id, answered: r.answered, correct: r.correct, incorrect: r.incorrect, unsure: r.unsure, rightPct: pct(r.correct, r.correct + r.incorrect) })),
      },
      topDiseasesLast30Days: topDiseases.map((r) => ({ crop: r._id.crop, disease: r._id.disease, n: r.n })),
      push: { subscriptions: push, byLanguage: toMap(pushByLang) },
    });
  } catch (error) {
    logError(req, 'Admin summary failed', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default adminRouter;
