import mongoose from "mongoose";

// How many calls we make to the free services whose limits can stop us (docs/MONITORING.md, "Weather alerts"): a counter per service and
// day, shown by GET /api/alerts/health next to the limit, so that a growing user base is seen before Open-Meteo answers 429.
// It counts our own calls only (no user, no place) and never fails a request: a lost count is a lost count.
export const LIMITS = {
  'open-meteo': { perDay: 10000, note: 'forecast calls; 10,000 a day, 5,000 an hour, 600 a minute, free for non-commercial use' },
  'open-meteo-flood': { perDay: 10000, note: 'flood API calls weighted by locations x days / 14; shares the Open-Meteo allowance' },
  firms: { perDay: null, note: 'NASA FIRMS requests; 5,000 per 10 minutes' },
  'data-gov': { perDay: null, note: 'data.gov.in mandi price requests (about one per state and crop every 6 hours); it answers 429 to bursts' },
  'earth-engine-radar': { perDay: null, note: 'satellite flood checks (about 1.3 EECU-seconds each; the free tier has 18,000 EECU-seconds a month)' },
};

const schema = new mongoose.Schema({
  day: { type: String, required: true },                 // UTC date, the day Open-Meteo counts in
  service: { type: String, required: true },
  calls: { type: Number, default: 0 },
  at: { type: Date, default: Date.now, expires: 45 * 86400 },
});
schema.index({ day: 1, service: 1 }, { unique: true });
export const ApiUsage = mongoose.models.ApiUsage || mongoose.model('ApiUsage', schema);

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

export async function countUsage(service, n = 1, now = new Date()) {
  try { await ApiUsage.updateOne({ day: today(now), service }, { $inc: { calls: n }, $setOnInsert: { at: now } }, { upsert: true }); } catch { /* a lost count */ }
}

// Counts a call BEFORE it is made and says whether it fits: the service's own total plus Open-Meteo's other service must stay at or under
// `limitPct` of the day's allowance. When it does not fit the count is given back. Done in the database, so twenty requests arriving together
// cannot all see "room left" (checking first and counting after let 60 history calls through a budget of 11 in the load test).
export async function reserveUsage(service, n, limitPct, now = new Date()) {
  try {
    const row = await ApiUsage.findOneAndUpdate({ day: today(now), service }, { $inc: { calls: n }, $setOnInsert: { at: now } }, { upsert: true, returnDocument: 'after' });
    const other = await ApiUsage.findOne({ day: today(now), service: service === 'open-meteo' ? 'open-meteo-flood' : 'open-meteo' }).lean();
    if (((row.calls + (other?.calls ?? 0)) / LIMITS['open-meteo'].perDay) * 100 <= limitPct) return true;
    await ApiUsage.updateOne({ day: today(now), service }, { $inc: { calls: -n } });
    return false;
  } catch { return false; }  // if the count cannot be kept, the expensive call is not made
}

// -> { day, services: [{ service, calls, perDay, pct, note }], openMeteoPct }  (Open-Meteo's two services share one allowance)
export async function usageToday(now = new Date()) {
  const rows = await ApiUsage.find({ day: today(now) }).lean();
  const calls = new Map(rows.map((r) => [r.service, r.calls]));
  const services = Object.entries(LIMITS).map(([service, l]) => ({ service, calls: calls.get(service) ?? 0, perDay: l.perDay, pct: l.perDay ? Math.round(((calls.get(service) ?? 0) / l.perDay) * 100) : null, note: l.note }));
  const openMeteo = (calls.get('open-meteo') ?? 0) + (calls.get('open-meteo-flood') ?? 0);
  return { day: today(now), services, openMeteoCalls: openMeteo, openMeteoPct: Math.round((openMeteo / LIMITS['open-meteo'].perDay) * 100) };
}
