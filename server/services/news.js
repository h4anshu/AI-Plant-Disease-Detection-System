import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import axios from "axios";
import NewsItem from "../models/News.js";
import logger from "../utils/logger.js";
import { parseFeed, tag } from "./newsFeed.js";

// News and advisories for a saved field (docs/FIELD_ALERTS.md, "News and advisories"). Headline, source, date and an outbound link,
// never the article: nothing is copied, summarised or rewritten. Two public RSS feeds, each with its terms recorded there; a feed
// that disappears is skipped and the other one still serves (the panel just has fewer items). No page is scraped.
const require = createRequire(import.meta.url);
const UA = 'Mozilla/5.0 (compatible; PlantGuard/1.0; non-commercial farm news links) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const KEEP_MS = 30 * 864e5;
const SHOW_MS = 21 * 864e5;
export const MAX_ITEMS = 6;

// PIB's feed is every ministry's press release in Hindi, with no date; only the ones about farming, weather or water are kept
const FARM = /किसान|कृषि|फसल|खरीफ|रबी|एमएसपी|सिंचाई|मानसून|बारिश|वर्षा|बाढ़|बाढ|सूखा|चक्रवात|उर्वरक|बागवानी|मौसम|farmer|agricultur|\bcrops?\b|kharif|rabi|\bMSP\b|irrigation|monsoon|rainfall|flood|drought|cyclone|fertili[sz]er|horticulture/i;

export const FEEDS = [
  { id: 'thehindu', name: 'The Hindu', lang: 'en', hosts: ['www.thehindu.com', 'thehindu.com'], keep: () => true,
    url: () => process.env.NEWS_HINDU_URL || 'https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss' },
  { id: 'pib', name: 'PIB', lang: 'hi', hosts: ['pib.gov.in', 'www.pib.gov.in'], keep: (i) => FARM.test(i.title),
    url: () => process.env.NEWS_PIB_URL || 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3' }, // asking for Lang=1 is redirected to this one
];

const get = async (url) => (await axios.get(url, { timeout: 15000, responseType: 'text', maxContentLength: 2e6, headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml' } })).data;

// -> { stored, newest } for one feed; throws when the feed is not a feed
async function ingestFeed(feed, now) {
  const items = parseFeed(await get(feed.url()), feed.hosts).filter(feed.keep)
    .filter((i) => !i.date || now - i.date < KEEP_MS);
  const ops = items.map((i) => {
    const date = i.date && i.date < now ? i.date : null; // a date in the future is not believed
    const set = { source: feed.id, title: i.title, link: i.link, lang: feed.lang, ...tag(`${i.title} ${i.summary}`) };
    const first = { expireAt: new Date(now.getTime() + KEEP_MS) };
    if (date) { set.publishedAt = date; set.dated = true; } else { first.publishedAt = now; first.dated = false; }
    return { updateOne: { filter: { key: createHash('sha1').update(i.link).digest('hex') }, update: { $set: set, $setOnInsert: first }, upsert: true } };
  });
  if (ops.length) await NewsItem.bulkWrite(ops, { ordered: false });
  return { stored: ops.length, newest: items.reduce((m, i) => (i.date && i.date > m ? i.date : m), new Date(0)) };
}

// the ingest source of services/alerts/ingest.js: every feed is tried, the refresh fails only when all of them do
export async function ingestNews({ now = new Date() } = {}) {
  const done = await Promise.allSettled(FEEDS.map((f) => ingestFeed(f, now)));
  done.forEach((r, i) => { if (r.status === 'rejected') logger.warn({ feed: FEEDS[i].id, reason: String(r.reason?.response?.status ?? r.reason?.code ?? r.reason?.message).slice(0, 120) }, 'News feed failed'); });
  const ok = done.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('no news feed answered');
  const newest = ok.reduce((m, r) => (r.newest > m ? r.newest : m), new Date(0));
  return { recordCount: ok.reduce((n, r) => n + r.stored, 0), newestItemAt: newest.getTime() ? newest : null };
}

const LINKS = require('../data/official_links.json');

// The items for a field in `state` growing `crop`. An item about another state is left out (a Kerala story is not news for a
// Punjab farmer); one about this state comes first, then one that names the crop, then the newest. With no known state only items
// that name no state are shown.
export async function newsFor(state, crop, now = new Date()) {
  const rows = await NewsItem.find({ publishedAt: { $gt: new Date(now.getTime() - SHOW_MS) } }).sort({ publishedAt: -1 }).limit(150).lean();
  const items = rows.filter((r) => (state ? !r.states.length || r.states.includes(state) : !r.states.length))
    .map((r) => ({ r, score: (state && r.states.includes(state) ? 2 : 0) + (crop && r.crops.includes(crop) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || b.r.publishedAt - a.r.publishedAt).slice(0, MAX_ITEMS);
  return items.map(({ r }) => ({ title: r.title, link: r.link, source: r.source, sourceName: FEEDS.find((f) => f.id === r.source)?.name ?? r.source,
    date: r.publishedAt.toISOString(), dated: r.dated, lang: r.lang, state: !!state && r.states.includes(state), crop: !!crop && r.crops.includes(crop) }));
}

// the hand-collected official pages (data/official_links.json): the same national ones for everyone, plus a state's own if listed
export const linksFor = (state) => ({ national: LINKS.national, state: (state && LINKS.states[state]) || [] });
