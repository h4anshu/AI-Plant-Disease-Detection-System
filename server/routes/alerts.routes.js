import express from "express";
import { adminLimiter, alertLimiter } from "../middleware/rateLimit.js";
import adminGuard from "../middleware/adminGuard.js";
import { SOURCES, isEnabled, refresh, sourceStatus } from "../services/alerts/ingest.js";
import { usageToday } from "../services/usage.js";
import AlertFeedback from "../models/AlertFeedback.js";
import PushSubscription from "../models/PushSubscription.js";
import { dispatchPushes, pushConfigured } from "../services/push.js";
import logger from "../utils/logger.js";

// Operator routes for the official warnings (docs/FIELD_ALERTS.md): fetch the sources now (what Cloud Scheduler will call) and
// read their health. Both need the shared secret in x-alerts-token (ALERTS_ADMIN_TOKEN); without that setting they answer 503.
const alertsRouter = express.Router();
alertsRouter.use(alertLimiter);

const guard = [adminLimiter, adminGuard];   // wrong tokens are counted per IP

// Everything an operator needs on one page (docs/MONITORING.md, "Weather alerts"): how fresh each feed is, which kill switches are on, which
// optional keys and services are configured, and today's calls to the free services against their limits. Names and numbers only.
const SWITCHES = ['sachet', 'imd', 'cwc', 'glofas', 'radar', 'news', 'fire', 'community', 'mandi'];
alertsRouter.get('/health', guard, async (req, res, next) => {
  try {
    res.json({ sources: await sourceStatus(), switches: Object.fromEntries(SWITCHES.map((n) => [n, isEnabled(n) ? 'on' : 'off'])),
      configured: { firmsKey: !!process.env.FIRMS_MAP_KEY, geoService: !!process.env.GEO_SERVICE_URL, push: pushConfigured() },
      push: { subscriptions: await PushSubscription.countDocuments() }, usage: await usageToday() });
  } catch (error) { next(error); }
});
// "Did this help?" per rule: how many answers, the share that acted on the alert and the share that called it wrong (the target is >= 60% helpful)
alertsRouter.get('/feedback', guard, async (req, res, next) => {
  try {
    const rows = await AlertFeedback.aggregate([
      { $group: { _id: '$rule', total: { $sum: 1 }, acted: { $sum: { $cond: [{ $eq: ['$answer', 'acted'] }, 1, 0] } }, notNeeded: { $sum: { $cond: [{ $eq: ['$answer', 'not_needed'] }, 1, 0] } }, wrong: { $sum: { $cond: [{ $eq: ['$answer', 'wrong'] }, 1, 0] } } } },
      { $sort: { total: -1, _id: 1 } },
    ]);
    const share = (n, total) => Math.round((n / total) * 100);
    const rules = rows.map((r) => ({ rule: r._id, total: r.total, acted: r.acted, notNeeded: r.notNeeded, wrong: r.wrong, helpfulPct: share(r.acted, r.total), wrongPct: share(r.wrong, r.total) }));
    const total = rules.reduce((n, r) => n + r.total, 0);
    const acted = rules.reduce((n, r) => n + r.acted, 0);
    res.json({ total, helpfulPct: total ? share(acted, total) : null, rules });
  } catch (error) { next(error); }
});
alertsRouter.post('/tick', guard, async (req, res, next) => {
  try {
    await Promise.all(Object.keys(SOURCES).map((source) => refresh(source, { force: true })));
    // then the notifications for what the feeds and the forecast now say (docs/PUSH.md); a failure there never fails the refresh
    const push = await dispatchPushes().catch((err) => { logger.error({ message: err.message }, 'Push dispatch failed'); return { error: true }; });
    res.json({ sources: await sourceStatus(), push });
  } catch (error) { next(error); }
});

export default alertsRouter;
