import axios from "axios";
import { OfficialAlert } from "../../models/OfficialAlert.js";
import { parseCap, parseRss, toRecord } from "./cap.js";

// NDMA SACHET: the all-India RSS feed lists the newest ~100 alerts (about a day and a half); each item links to its CAP file.
// docs/FIELD_ALERTS.md, "Official warnings". The feed needs a browser-like User-Agent and sends no-store, so we poll politely
// (services/alerts/ingest.js: at most every 10 minutes) and fetch a CAP file only once.
const feedUrl = () => process.env.SACHET_FEED_URL || 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
export const UA = 'Mozilla/5.0 (compatible; PlantGuard/1.0; field weather alerts) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const MAX_AGE_MS = 48 * 3600e3; // an item older than this is not fetched
const PARALLEL = 5;
const failed = new Set();        // guids that did not parse: not retried by this instance (it restarts often enough)

const get = async (url) => (await axios.get(url, { timeout: 15000, responseType: 'text', maxContentLength: 2e6, headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml' } })).data;

async function inChunks(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += PARALLEL) out.push(...await Promise.all(items.slice(i, i + PARALLEL).map(fn)));
  return out;
}

// Fetches the CAP file of every item not stored yet and applies it in the order it was published: an Update or Cancel supersedes
// the alerts it references. Returns what the health record needs.
export async function ingestSachet({ now = new Date() } = {}) {
  const items = parseRss(await get(feedUrl()));
  const host = new URL(feedUrl()).host;
  const recent = items.filter((i) => now - i.pubDate < MAX_AGE_MS && !failed.has(i.guid));
  const have = new Set((await OfficialAlert.find({ guid: { $in: recent.map((i) => i.guid) } }, 'guid').lean()).map((d) => d.guid));
  // only links on the feed's own host are followed
  const todo = recent.filter((i) => !have.has(i.guid) && (() => { try { return new URL(i.link).host === host; } catch { return false; } })());

  const fetched = await inChunks(todo, async (item) => {
    try { return { item, cap: parseCap(await get(item.link)) }; } catch { failed.add(item.guid); return { item, cap: null }; }
  });
  let added = 0;
  for (const { item, cap } of fetched.filter((f) => f.cap).sort((a, b) => a.item.pubDate - b.item.pubDate)) {
    const rec = toRecord(cap, item.guid);
    // an Update or Cancel supersedes what it references; an older alert that turns up after its Update is superseded on arrival
    if (rec.references.length) await OfficialAlert.updateMany({ identifier: { $in: rec.references }, supersededBy: null }, { $set: { supersededBy: rec.identifier } });
    const newer = await OfficialAlert.findOne({ references: rec.identifier, identifier: { $ne: rec.identifier } }, 'identifier').lean();
    await OfficialAlert.updateOne({ identifier: rec.identifier }, { $set: { ...rec, fetchedAt: now, supersededBy: newer?.identifier ?? null } }, { upsert: true });
    added += 1;
  }
  const bad = fetched.filter((f) => !f.cap).length;
  if (todo.length && !added && bad === todo.length) throw new Error('no CAP file could be read');
  return { recordCount: items.length, newestItemAt: items.reduce((m, i) => (!m || i.pubDate > m ? i.pubDate : m), null), added, failed: bad };
}
