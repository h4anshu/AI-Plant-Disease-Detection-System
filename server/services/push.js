import webpush from 'web-push';
import PushSubscription, { MAX_SUBSCRIPTIONS, SENT_KEPT } from '../models/PushSubscription.js';
import { computeFieldAlerts } from '../controllers/fieldController.js';
import { pushMessage, testMessage } from '../utils/pushText.js';
import logger from '../utils/logger.js';

// Web push (docs/PUSH.md): a notification on the phone when a warning is issued for a saved field, without opening the app.
// Free: it goes through the browser's own push service (Google, Mozilla, Apple), encrypted for that one browser. Needs three settings,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address); without them the feature is off and the screen hides its button.
// Pushes are sent from POST /api/alerts/tick (Cloud Scheduler), never from a user's request.

const RANK = { info: 0, watch: 1, warn: 2, urgent: 3 };
const GONE = [404, 410];          // the push service says this subscription no longer exists
const MAX_FAILURES = 8;           // in a row, then the subscription is dropped
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
const minLevel = () => (RANK[process.env.PUSH_MIN_LEVEL] !== undefined ? process.env.PUSH_MIN_LEVEL : 'warn');   // "watch" and "tip" alerts stay on the screen: a phone that buzzes for every tip gets switched off
const perRun = () => Number(process.env.PUSH_MAX_PER_RUN) || 3;

// ---- who may be a push endpoint --------------------------------------------------------------------------------------------------------
// The server POSTs to a subscription's endpoint, so an endpoint must never be an address of the attacker's choosing (an internal service, a
// metadata server). Only the push services of the browsers, over https, with no credentials in the address.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/i;
export function validEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 600) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && PUSH_HOSTS.test(u.hostname);
}
const B64URL = /^[A-Za-z0-9_-]{8,200}$/;
export const validKeys = (k) => !!k && typeof k === 'object' && B64URL.test(k.p256dh ?? '') && B64URL.test(k.auth ?? '');

// ---- sending ---------------------------------------------------------------------------------------------------------------------------
const realTransport = (sub, payload) => webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
  vapidDetails: { subject: process.env.VAPID_SUBJECT, publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY },
  TTL: 6 * 3600,        // a frost warning that could not be delivered within 6 hours is no longer news
  urgency: 'high',
});
let transport = realTransport;
export const setTransport = (fn) => { transport = fn ?? realTransport; };   // tests

// one notification to one subscription -> 'sent' | 'gone' | 'failed'
async function deliver(sub, message) {
  try {
    await transport(sub, JSON.stringify(message));
    return 'sent';
  } catch (err) {
    if (GONE.includes(err.statusCode)) return 'gone';
    logger.warn({ status: err.statusCode ?? null, code: err.code ?? null, message: err.message }, 'Push send failed');   // never the endpoint: it is a secret URL
    return 'failed';
  }
}

// Sends the subscription's owner's own test message: proof that notifications reach this phone
export async function sendTest(sub) {
  const result = await deliver(sub, { ...testMessage(sub.lang), tag: 'pg-test', url: '/overview' });
  if (result === 'gone') await PushSubscription.deleteOne({ _id: sub._id });
  return result;
}

// ---- saving ----------------------------------------------------------------------------------------------------------------------------
// owner: { userId, deviceId? } as ownerFilter gives it. The same endpoint again (the app syncs it on each visit) is an update, and moves it
// to the current owner: a browser's subscription belongs to the browser, and whoever uses it now should be the one told.
export async function saveSubscription(owner, { endpoint, keys, lang }) {
  const own = { userId: owner.userId, deviceId: owner.deviceId ?? null };
  const fields = { ...own, keys: { p256dh: keys.p256dh, auth: keys.auth }, lang, seenAt: new Date() };
  const existing = await PushSubscription.findOne({ endpoint }).select('_id').lean();
  if (!existing && await PushSubscription.countDocuments(owner.deviceId ? { userId: owner.userId, deviceId: owner.deviceId } : { userId: owner.userId }) >= MAX_SUBSCRIPTIONS) return { error: 'limit' };
  try {
    await PushSubscription.updateOne({ endpoint }, { $set: fields, $setOnInsert: { endpoint } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;   // two syncs of one browser at once: the other won, which is what was wanted
  }
  return { ok: true };
}

// ---- dispatch --------------------------------------------------------------------------------------------------------------------------
const ownerOf = (sub) => (sub.deviceId ? { userId: sub.userId, deviceId: sub.deviceId } : { userId: sub.userId });
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// the alerts of the result that deserve a notification, worst first: { key, alert, crop }
function candidates(result) {
  const min = RANK[minLevel()];
  const out = [];
  for (const field of result.fields ?? []) {
    for (const alert of [...(field.alerts ?? []), ...(field.official ?? [])]) {
      if ((RANK[alert.level] ?? -1) >= min) out.push({ key: `${alert.id}|${alert.level}`, alert, crop: field.crop });
    }
  }
  const seen = new Set();
  return out.filter((c) => !seen.has(c.key) && seen.add(c.key)).sort((a, b) => RANK[b.alert.level] - RANK[a.alert.level] || (a.alert.offset ?? 0) - (b.alert.offset ?? 0));
}

async function notifyOwner(subs, result, now, stats) {
  const list = candidates(result);
  if (!list.length) return;
  for (const sub of subs) {
    let n = 0;
    for (const { key, alert, crop } of list) {
      if (n >= perRun()) break;
      if (sub.sent?.includes(key)) continue;
      // claim the alert before sending: two runs at once must not both send it. A failed send gives the claim back.
      const claimed = await PushSubscription.findOneAndUpdate({ _id: sub._id, sent: { $ne: key } }, { $push: { sent: { $each: [key], $slice: -SENT_KEPT } } });
      if (!claimed) continue;
      n += 1;
      const outcome = await deliver(sub, { ...pushMessage(alert, crop, sub.lang), tag: `${alert.rule ?? alert.source}|${alert.date}`, url: '/overview?mode=weather' });
      if (outcome === 'sent') {
        stats.sent += 1;
        await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSentAt: now, failures: 0 } });
      } else if (outcome === 'gone') {
        stats.removed += 1;
        await PushSubscription.deleteOne({ _id: sub._id });
        break;
      } else {
        stats.failed += 1;
        const after = await PushSubscription.findOneAndUpdate({ _id: sub._id }, { $pull: { sent: key }, $inc: { failures: 1 } }, { returnDocument: 'after' });
        if (after && after.failures >= MAX_FAILURES) { await PushSubscription.deleteOne({ _id: sub._id }); stats.removed += 1; }
        break;
      }
    }
  }
}

// Looks at every owner with a subscription, computes what the screen would show them, and sends what is new. `compute` is a test seam.
export async function dispatchPushes({ now = new Date(), compute = computeFieldAlerts, budgetMs = Number(process.env.PUSH_BUDGET_MS) || 100000, maxOwners = 300 } = {}) {
  const stats = { configured: pushConfigured(), owners: 0, subscriptions: 0, sent: 0, removed: 0, failed: 0, skipped: 0 };
  if (!stats.configured) return stats;
  const subs = await PushSubscription.find({}).sort({ lastSentAt: 1, createdAt: 1 }).limit(maxOwners * MAX_SUBSCRIPTIONS).lean();
  stats.subscriptions = subs.length;
  const byOwner = new Map();
  for (const s of subs) {
    const k = `${s.userId}|${s.deviceId ?? ''}`;
    byOwner.set(k, [...(byOwner.get(k) ?? []), s]);
  }
  const owners = [...byOwner.values()].slice(0, maxOwners);
  stats.owners = owners.length;
  const deadline = Date.now() + budgetMs;
  for (const group of chunks(owners, 5)) {
    if (Date.now() > deadline) { stats.skipped += group.length; continue; }
    await Promise.all(group.map(async (mine) => {
      try {
        await notifyOwner(mine, await compute(ownerOf(mine[0]), { now }), now, stats);
      } catch (err) {
        stats.failed += 1;
        logger.warn({ message: err.message }, 'Push run failed for one owner');
      }
    }));
  }
  return stats;
}
