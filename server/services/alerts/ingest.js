import { SourceHealth } from "../../models/OfficialAlert.js";
import FieldModel from "../../models/Field.js";
import logger from "../../utils/logger.js";
import { ingestSachet } from "./sachet.js";
import { ingestImd, resolveDistricts } from "./imd.js";
import { ingestCwc } from "./cwc.js";
import { ingestNews } from "../news.js";

// Keeps the official sources fresh (docs/FIELD_ALERTS.md, "Official warnings"). Cloud Run has no timer of its own, so the first
// request after an interval refreshes the source (a lease in SourceHealth keeps two instances from doing it together); POST
// /api/alerts/tick does the same on demand, for Cloud Scheduler later. A failed source never fails a request: the screen says
// "delayed" from the health record instead.
const MIN = 60e3;
export const SOURCES = {
  sachet: { every: 10 * MIN, okWithin: 30 * MIN, staleNewest: 6 * 60 * MIN, run: ingestSachet },
  imd: { every: 30 * MIN, okWithin: 90 * MIN, staleNewest: 24 * 60 * MIN, run: ingestImd },
  cwc: { every: 30 * MIN, okWithin: 90 * MIN, staleNewest: Infinity, run: ingestCwc }, // river gauges (a flood signal, not a warning feed)
  // headlines for the news panel: refreshed when that panel is asked for, not with the alerts, and not part of the alerts' "delayed" notice
  news: { every: 60 * MIN, okWithin: 3 * 60 * MIN, staleNewest: 14 * 24 * 60 * MIN, onDemand: true, run: ingestNews },
};
const DOWN_AFTER = 6 * 60 * MIN;
const LEASE_MS = 90e3;

export const isEnabled = (source) => !(process.env.ALERTS_DISABLED_SOURCES ?? '').split(',').map((s) => s.trim()).includes(source);

// true when this instance won the right to fetch `source` now
async function claim(source, now, every, force) {
  const due = force ? {} : { $or: [{ attemptedAt: null }, { attemptedAt: { $lte: new Date(now.getTime() - every) } }] };
  try {
    return !!await SourceHealth.findOneAndUpdate(
      { source, $and: [due, { $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }] },
      { $set: { attemptedAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS) } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    if (error.code === 11000) return false; // the record exists and is not due, or another instance holds the lease
    throw error;
  }
}

const inflight = new Map();

// fetch one source if it is due (or `force`); never throws
export function refresh(source, { force = false, now = new Date() } = {}) {
  if (!SOURCES[source] || !isEnabled(source)) return Promise.resolve(false);
  if (!inflight.has(source)) {
    inflight.set(source, (async () => {
      const spec = SOURCES[source];
      try {
        if (!await claim(source, now, spec.every, force)) return false;
        try {
          const r = await spec.run({ now });
          await SourceHealth.updateOne({ source }, { $set: { fetchedAt: now, newestItemAt: r.newestItemAt, recordCount: r.recordCount, errorReason: null, leaseUntil: null } });
          if (r.newestItemAt && now - r.newestItemAt > spec.staleNewest) logger.warn({ source, newestItemAt: r.newestItemAt }, 'Official source has no new items');
          return true;
        } catch (error) {
          const reason = String(error.response?.status ?? error.code ?? error.message).slice(0, 120);
          await SourceHealth.updateOne({ source }, { $set: { errorReason: reason, leaseUntil: null } });
          logger.warn({ source, reason }, 'Official source fetch failed');
          return false;
        }
      } catch (error) { // the database itself failed
        logger.error({ source, message: error.message }, 'Official source refresh failed');
        return false;
      } finally { inflight.delete(source); }
    })());
  }
  return inflight.get(source);
}

// refresh every due source, waiting at most `budgetMs` (a slow source keeps going in the background)
export async function ensureFresh({ budgetMs = 6000, now = new Date() } = {}) {
  const all = Promise.allSettled(Object.keys(SOURCES).filter((s) => !SOURCES[s].onDemand).map((s) => refresh(s, { now })));
  let timer;
  await Promise.race([all, new Promise((resolve) => { timer = setTimeout(resolve, budgetMs); })]);
  clearTimeout(timer);
}

// ok | delayed | down | disabled, from the last SUCCESSFUL fetch
export async function sourceStatus(now = new Date()) {
  const docs = new Map((await SourceHealth.find({}).lean()).map((d) => [d.source, d]));
  return Object.entries(SOURCES).map(([source, spec]) => {
    const d = docs.get(source);
    const age = d?.fetchedAt ? now - d.fetchedAt : Infinity;
    return { source, state: !isEnabled(source) ? 'disabled' : age <= spec.okWithin ? 'ok' : age <= DOWN_AFTER ? 'delayed' : 'down',
      fetchedAt: d?.fetchedAt ?? null, newestItemAt: d?.newestItemAt ?? null, recordCount: d?.recordCount ?? null, errorReason: d?.errorReason ?? null };
  });
}

const RETRY_MS = 15 * MIN;

// Fields without their districts yet (every field saved before this feature, and every new one) get them from IMD's point query.
// A failure is remembered for 15 minutes so a down IMD is not asked once per page view.
export async function ensureDistricts(fields, now = new Date()) {
  if (!isEnabled('imd')) return;
  await Promise.all(fields.filter((f) => !f.district?.at && !(f.districtTriedAt && now - f.districtTriedAt < RETRY_MS)).map(async (f) => {
    try {
      const [lon, lat] = f.location.coordinates;
      f.district = { ...await resolveDistricts(lat, lon), at: now };
      await FieldModel.updateOne({ _id: f._id }, { $set: { district: f.district } });
    } catch (error) {
      f.districtTriedAt = now;
      await FieldModel.updateOne({ _id: f._id }, { $set: { districtTriedAt: now } }).catch(() => {});
      logger.warn({ code: error.code ?? null, status: error.response?.status ?? null }, 'District lookup failed'); // no coordinates
    }
  }));
}
