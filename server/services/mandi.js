import { createHash } from "node:crypto";
import axios from "axios";
import mongoose from "mongoose";
import { normDistrict } from "../utils/districts.js";
import { countUsage } from "./usage.js";

// "Mandi prices": what the market committees reported for the field's crop in its state (docs/FIELD_ALERTS.md, "Mandi prices"). Agmarknet's
// "Variety-wise Daily Market Prices Data of Commodity" on data.gov.in, a free key (DATA_GOV_API_KEY, kept on the server). The last price that
// was reported, in rupees per quintal; never a forecast, never "sell" or "hold". Only the state and the commodity are asked for, so nothing
// about a farmer or a field is sent.
const base = () => process.env.DATA_GOV_URL || 'https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24';
const ROWS = 400;                // the newest rows of one state and commodity: about a week of a busy state
const MAX_AGE_DAYS = 14;         // an older last price is "no recent price", with its date
const MIN_PRICE = 10;           // rupees a quintal: below this a row is a placeholder, not a price
const MAX_PRICE = 5e6;
const CACHE_S = 6 * 3600;
const FAIL_MS = 10 * 60e3;       // after a failure (a 429 included) the same question waits 10 minutes
const DAY = 864e5;

// the commodity names of the dataset for the ten crops of the app (rice farmers sell paddy)
export const COMMODITY = {
  wheat: 'Wheat', rice: 'Paddy(Dhan)(Common)', sugarcane: 'Sugarcane', potato: 'Potato', maize: 'Maize', pigeonpea: 'Arhar (Tur/Red Gram)(Whole)',
  groundnut: 'Groundnut', blackgram: 'Black Gram (Urd Beans)(Whole)', apple: 'Apple', banana: 'Banana',
};
// states the dataset spells its own way (checked 28 Oct 2026); both spellings of Uttarakhand hold rows. Ladakh and Dadra & Nagar Haveli and Daman & Diu have none.
const STATE_NAMES = { Uttarakhand: ['Uttarakhand', 'Uttrakhand'], Chhattisgarh: ['Chattisgarh'], Puducherry: ['Pondicherry'], Delhi: ['NCT of Delhi'], 'Andaman and Nicobar Islands': ['Andaman and Nicobar'] };
export const statesOf = (state) => STATE_NAMES[state] ?? [state];

const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  rows: { type: mongoose.Schema.Types.Mixed, required: true },     // [{ d: 'YYYY-MM-DD', m: market, k: district, p: modal price }]: public market data
  createdAt: { type: Date, default: Date.now, expires: CACHE_S },
});
export const MandiCache = mongoose.models.MandiCache || mongoose.model('MandiCache', cacheSchema);

// dd/mm/yyyy -> 'YYYY-MM-DD' or null
const isoDate = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim()); if (!m) return null; const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCMonth() === +m[2] - 1 ? d.toISOString().slice(0, 10) : null; };

// the dataset's answer -> compact rows; anything that is not a list of records throws (an error page must not read as "no prices").
// Older rows hold prices as text ("980"); a price that is not a number is dropped, and so is one under 10 rupees a quintal: no crop sells for
// that little, and the real feed of 27 Oct 2026 had a market reporting 0.01 (a placeholder), which would have been shown as the lowest price.
export function parseRecords(body) {
  if (!Array.isArray(body?.records)) throw new Error('not a mandi table');
  return body.records.map((r) => ({ d: isoDate(r.Arrival_Date), m: String(r.Market ?? '').trim(), k: String(r.District ?? '').trim(), p: Number(r.Modal_Price) }))
    .filter((r) => r.d && r.m && Number.isFinite(r.p) && r.p >= MIN_PRICE && r.p <= MAX_PRICE);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// one price per market per date (several varieties: their median)
const perMarket = (rows) => { const by = new Map(); for (const r of rows) { const k = `${r.d}|${r.m}`; (by.get(k) ?? by.set(k, { d: r.d, m: r.m, k: r.k, ps: [] }).get(k)).ps.push(r.p); } return [...by.values()].map((x) => ({ d: x.d, m: x.m, k: x.k, p: Math.round(median(x.ps)) })); };

// rows of one state and commodity, `now`, the field's district names (any spelling) -> the card's numbers
// { status: 'none' } | { status: 'stale', lastDate } | { status: 'ok', date, ageDays, markets, median, min, max, local: [{ market, district, price }], trend: { pct, since, markets } | null }
export function summarize(rows, districtNames = [], now = new Date()) {
  const markets = perMarket(rows);
  if (!markets.length) return { status: 'none' };
  const last = markets.reduce((m, x) => (x.d > m ? x.d : m), '');
  const age = days(last, now.toISOString().slice(0, 10));
  if (age > MAX_AGE_DAYS) return { status: 'stale', lastDate: last, ageDays: age };
  const today = markets.filter((x) => x.d === last);
  const prices = today.map((x) => x.p);
  const mine = new Set(districtNames.map(normDistrict).filter(Boolean));
  const local = today.filter((x) => mine.has(normDistrict(x.k))).sort((a, b) => a.m.localeCompare(b.m)).slice(0, 3).map((x) => ({ market: x.m, district: x.k, price: x.p }));
  // the change since an earlier reporting day (3 to 14 days before), only among markets that reported on both days: the market mix changes from day to day
  const earlier = [...new Set(markets.map((x) => x.d))].filter((d) => days(d, last) >= 3 && days(d, last) <= 14).sort().reverse();
  let trend = null;
  for (const d of earlier) {
    const before = new Map(markets.filter((x) => x.d === d).map((x) => [x.m, x.p]));
    const changes = today.filter((x) => before.has(x.m)).map((x) => ((x.p - before.get(x.m)) / before.get(x.m)) * 100);
    if (changes.length >= 3) { trend = { pct: Math.round(median(changes) * 10) / 10, since: d, markets: changes.length }; break; }
  }
  return { status: 'ok', date: last, ageDays: age, markets: today.length, median: Math.round(median(prices)), min: Math.min(...prices), max: Math.max(...prices), local, trend };
}

// ---- asking data.gov.in: one request at a time, a pause between them (it answers 429 to bursts), one answer kept 6 hours ----
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
let gate = Promise.resolve();
const throttled = (fn) => { const run = gate.then(fn); gate = run.catch(() => {}).then(() => wait(Number(process.env.MANDI_GAP_MS ?? 400))); return run; };
const failed = new Map();
export const resetMandiFailures = () => failed.clear();

async function ask(state, commodity) {
  await countUsage('data-gov');
  const { data } = await axios.get(base(), { timeout: 30000, maxContentLength: 4e6,
    params: { 'api-key': process.env.DATA_GOV_API_KEY, format: 'json', limit: ROWS, 'filters[State]': state, 'filters[Commodity]': commodity, 'sort[Arrival_Date]': 'desc' } });
  return parseRecords(data);
}

// the rows of a state (all its spellings) and a commodity; throws when they could not be had
export async function rowsFor(state, commodity, now = new Date()) {
  const key = createHash('sha256').update(`mandi1|${state}|${commodity}`).digest('hex');
  const hit = await MandiCache.findOne({ key }).lean();
  if (hit) return hit.rows;
  if (failed.get(key) > now.getTime()) throw new Error('mandi prices failed recently');
  try {
    const rows = (await Promise.all(statesOf(state).map((s) => throttled(() => ask(s, commodity))))).flat();
    await MandiCache.updateOne({ key }, { $set: { rows, createdAt: now } }, { upsert: true });
    return rows;
  } catch (error) { failed.set(key, now.getTime() + FAIL_MS); throw error; }
}

export const pricesFor = async (state, crop, districtNames, now = new Date()) => summarize(await rowsFor(state, COMMODITY[crop], now), districtNames, now);
