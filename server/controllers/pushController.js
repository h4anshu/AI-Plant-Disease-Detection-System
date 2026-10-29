import PushSubscription from "../models/PushSubscription.js";
import { ownerFilter } from "./predictController.js";
import { pushConfigured, saveSubscription, sendTest, validEndpoint, validKeys } from "../services/push.js";
import { PUSH_LANGS } from "../utils/pushText.js";
import { logError } from "../utils/logger.js";

// Push subscriptions (docs/PUSH.md). A guest's belong to their browser, an account's to the account.

const unavailable = (res) => res.status(503).json({ message: 'Notifications are not available' });

// @route  GET /api/push/key -> { publicKey }: what the browser needs to subscribe
export const getKey = (req, res) => (pushConfigured() ? res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }) : unavailable(res));

// @route  POST /api/push/subscribe  { subscription: { endpoint, keys: { p256dh, auth } }, lang }
export const subscribe = async (req, res) => {
  try {
    if (!pushConfigured()) return unavailable(res);
    const owner = ownerFilter(req);
    if (!owner) return res.status(400).json({ message: 'Missing device id' });
    const { subscription, lang } = req.body ?? {};
    if (!validEndpoint(subscription?.endpoint) || !validKeys(subscription?.keys)) return res.status(400).json({ message: 'Invalid subscription' });
    const result = await saveSubscription(owner, { endpoint: subscription.endpoint, keys: subscription.keys, lang: PUSH_LANGS.includes(lang) ? lang : 'en' });
    if (result.error) return res.status(409).json({ message: 'Too many devices have notifications on. Turn them off on one first.' });
    res.status(201).json({ subscribed: true });
  } catch (error) {
    logError(req, 'Push subscribe failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  POST /api/push/unsubscribe  { endpoint }
// No sign-in needed: the endpoint is a secret only that browser holds, and this must work after a sign-out or an ended session.
export const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body ?? {};
    if (typeof endpoint !== 'string' || endpoint.length > 600) return res.status(400).json({ message: 'Invalid subscription' });
    const { deletedCount } = await PushSubscription.deleteOne({ endpoint });
    res.json({ removed: deletedCount });
  } catch (error) {
    logError(req, 'Push unsubscribe failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route  POST /api/push/test  { endpoint } -> sends a test notification to that browser (only if it is the caller's)
export const test = async (req, res) => {
  try {
    if (!pushConfigured()) return unavailable(res);
    const owner = ownerFilter(req);
    const { endpoint } = req.body ?? {};
    if (!owner || typeof endpoint !== 'string') return res.status(404).json({ message: 'Notifications are not on for this device' });
    const sub = await PushSubscription.findOne({ endpoint, ...owner }).lean();
    if (!sub) return res.status(404).json({ message: 'Notifications are not on for this device' });
    const outcome = await sendTest(sub);
    if (outcome === 'gone') return res.status(404).json({ message: 'Notifications expired on this device. Turn them on again.' });
    if (outcome === 'failed') return res.status(502).json({ message: 'The notification could not be sent. Please try again.' });
    res.json({ sent: 1 });
  } catch (error) {
    logError(req, 'Push test failed', error);
    res.status(500).json({ message: 'Server error' });
  }
};
