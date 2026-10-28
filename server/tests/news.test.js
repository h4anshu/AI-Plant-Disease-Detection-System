import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import NewsItem from '../models/News.js';
import { SourceHealth } from '../models/OfficialAlert.js';
import { WeatherCache } from '../services/openMeteo.js';
import { parseFeed, tag } from '../services/newsFeed.js';
import { FEEDS, ingestNews, linksFor, newsFor } from '../services/news.js';
import { refresh } from '../services/alerts/ingest.js';
import logger from '../utils/logger.js';

// Real feeds captured on 26 Oct 2026 (tests/fixtures/news): The Hindu's agriculture feed (the first 15 of 60 items) and PIB's release
// feed (20 items, all ministries, Hindi, no dates; none of that day's was about farming). PIB items that are about farming, and the
// failure cases, are written by hand below and say so.
const fx = (p) => readFileSync(new URL(`./fixtures/news/${p}`, import.meta.url), 'utf8');
const HINDU = fx('thehindu.xml');
const PIB = fx('pib.xml');
const NOW = new Date('2026-10-26T17:00:00Z');
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const H = ['https://www.thehindu.com', '/sci-tech/agriculture/feeder/default.rss'];
const P = ['https://pib.gov.in', '/RssMain.aspx'];
const mockHindu = (body = HINDU, status = 200) => nock(H[0]).get(H[1]).reply(status, body);
const mockPib = (body = PIB, status = 200) => nock(P[0]).get(P[1]).query(true).reply(status, body);
// synthetic PIB feed: titles are real-looking Hindi headlines, links are PIB's own
const pibFeed = (titles) => `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Press Information Bureau</title>${titles.map((t, i) => `<item><title>${t}</title><link>https://pib.gov.in/PressReleaseIframePage.aspx?PRID=${900 + i}</link></item>`).join('')}</channel></rss>`;
const hinduItem = (title, link, date, extra = '') => `<item><title><![CDATA[${title}]]></title><description><![CDATA[${extra}]]></description><link><![CDATA[${link}]]></link><pubDate><![CDATA[${date}]]></pubDate></item>`;
const hinduFeed = (...items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>x</title>${items.join('')}</channel></rss>`;
const art = (n) => `https://www.thehindu.com/news/article${n}.ece`;

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
beforeEach(() => { process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas'; });
afterEach(async () => {
  nock.cleanAll();
  jest.restoreAllMocks();
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
  await Promise.all([Field, NewsItem, SourceHealth, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

describe('reading a feed', () => {
  test('The Hindu: title, https link and date of every item', () => {
    const items = parseFeed(HINDU, FEEDS[0].hosts);
    expect(items).toHaveLength(15);
    expect(items[0]).toMatchObject({ title: 'Over 100 mills commence sugar production', link: expect.stringMatching(/^https:\/\/www\.thehindu\.com\//) });
    expect(items[0].date.toISOString()).toBe('2026-10-26T15:58:20.000Z'); // Mon, 26 Oct 2026 21:28:20 +0530
    expect(items.every((i) => i.date && i.link.startsWith('https://'))).toBe(true);
  });

  test('PIB: no dates, Hindi titles', () => {
    const items = parseFeed(PIB, FEEDS[1].hosts);
    expect(items).toHaveLength(20);
    expect(items.every((i) => i.date === null && /[ऀ-ॿ]/.test(i.title))).toBe(true);
  });

  test('a link to another site, to plain http, or a javascript: link is dropped; a title is cleaned and cut', () => {
    const items = parseFeed(hinduFeed(
      hinduItem('Offsite', 'https://evil.example/a', 'Mon, 26 Oct 2026 10:00:00 +0530'),
      hinduItem('Insecure', 'http://www.thehindu.com/a', 'Mon, 26 Oct 2026 10:00:00 +0530'),
      hinduItem('Script', 'javascript:alert(1)', 'Mon, 26 Oct 2026 10:00:00 +0530'),
      hinduItem(`<b>Wheat</b>  sowing\n starts ${'x'.repeat(400)}`, art(1), 'Mon, 26 Oct 2026 10:00:00 +0530'),
      hinduItem('', art(2), 'Mon, 26 Oct 2026 10:00:00 +0530'),
    ), FEEDS[0].hosts);
    expect(items).toHaveLength(1);
    expect(items[0].title).toMatch(/^Wheat sowing starts x+$/);
    expect(items[0].title.length).toBe(300);
  });

  test('an error page or an empty answer is not a feed', () => {
    expect(() => parseFeed('<html><body>Service unavailable</body></html>', FEEDS[0].hosts)).toThrow('not an RSS feed');
    expect(() => parseFeed('', FEEDS[0].hosts)).toThrow();
    expect(parseFeed('<rss version="2.0"><channel><title>t</title></channel></rss>', FEEDS[0].hosts)).toEqual([]); // an empty channel is valid
  });
});

describe('which states and crops a headline names', () => {
  test.each([
    ['Cotton prices surge ₹4,000 a candy, T.N. textile mills fret over costs', ['Tamil Nadu'], []],
    ['On paddy field conservation in Keralam', ['Kerala'], ['rice']],
    ['All stakeholders must work together to resolve sugarcane growers’ issues: Karnataka CM', ['Karnataka'], ['sugarcane']],
    ['U.P. focuses on fisheries', ['Uttar Pradesh'], []],
    ['Rice millers fear steep hike in rice prices', [], ['rice']],
    ['Cyclone forms over the Bay of Bengal', [], []],
    ['Floods hit West Bengal and Odisha', ['West Bengal', 'Odisha'], []],
    ['The Prime Minister met farmers in New Delhi', [], []],
    ['Farmers protest in Delhi', ['Delhi'], []],
    ['Wheat sowing begins in Punjab and Haryana', ['Punjab', 'Haryana'], ['wheat']],
    ['Potato, apple and banana prices', [], ['potato', 'apple', 'banana']],
    ['Price of tur dal and urad rises', [], ['pigeonpea', 'blackgram']],
    ['Pineapple and maple exports', [], []], // apple and ... inside another word is not the crop
    ['T.n. is not an abbreviation here, and neither is cotton in a cottage', [], []],
  ])('%s', (title, states, crops) => {
    const t = tag(title);
    expect(t.states.sort()).toEqual([...states].sort());
    expect(t.crops).toEqual(crops);
  });

  test('Hindi: names are found, but not inside another word', () => {
    expect(tag('पंजाब और हरियाणा में गेहूं की बुवाई').states.sort()).toEqual(['Haryana', 'Punjab']);
    expect(tag('पंजाब और हरियाणा में गेहूं की बुवाई').crops).toEqual(['wheat']);
    expect(tag('असमान वर्षा से धान की फसल प्रभावित').states).toEqual([]);  // "असमान" (uneven) is not Assam
    expect(tag('असमान वर्षा से धान की फसल प्रभावित').crops).toEqual(['rice']);
    expect(tag('असम में बाढ़').states).toEqual(['Assam']);
    expect(tag('प्रधानमंत्री ने नई दिल्ली में किसानों से बात की').states).toEqual([]);
    expect(tag('जम्मू-कश्मीर में सेब की कटाई').states).toEqual(['Jammu and Kashmir']);
  });
});

describe('ingesting the feeds', () => {
  test('The Hindu items are stored with their date and tags; PIB items about nothing agricultural are not', async () => {
    mockHindu(); mockPib();
    const r = await ingestNews({ now: NOW });
    expect(r.recordCount).toBe(15);                           // PIB's 20 of that day are all about something else
    expect(r.newestItemAt.toISOString()).toBe('2026-10-26T15:58:20.000Z');
    const docs = await NewsItem.find({}).lean();
    expect(docs).toHaveLength(15);
    const tn = docs.find((d) => d.title.includes('T.N. textile'));
    expect(tn).toMatchObject({ source: 'thehindu', lang: 'en', dated: true, states: ['Tamil Nadu'] });
    expect(tn.expireAt.getTime() - NOW.getTime()).toBe(30 * 864e5);
    expect(docs.every((d) => !('summary' in d) && !('description' in d))).toBe(true); // nothing of the article is kept
  });

  test('a PIB item about farming is kept, undated: its date is when it was first seen, and does not move', async () => {
    mockHindu(hinduFeed()); mockPib(pibFeed(['केंद्रीय मंत्री ने पंजाब के किसानों के लिए रबी फसल की एमएसपी की घोषणा की', 'सड़क परिवहन मंत्री ने राजमार्ग का उद्घाटन किया']));
    await ingestNews({ now: NOW });
    const [a] = await NewsItem.find({}).lean();
    expect(await NewsItem.countDocuments()).toBe(1);
    expect(a).toMatchObject({ source: 'pib', lang: 'hi', dated: false, states: ['Punjab'], publishedAt: NOW, link: 'https://pib.gov.in/PressReleaseIframePage.aspx?PRID=900' });
    mockHindu(hinduFeed()); mockPib(pibFeed(['केंद्रीय मंत्री ने पंजाब के किसानों के लिए रबी फसल की एमएसपी की घोषणा की']));
    await ingestNews({ now: new Date(NOW.getTime() + 3600e3) });
    const [b] = await NewsItem.find({}).lean();
    expect(await NewsItem.countDocuments()).toBe(1);          // the same story is stored once
    expect(b.publishedAt).toEqual(NOW);
    expect(b.expireAt).toEqual(a.expireAt);
  });

  test('ingesting twice does not duplicate; an edited headline replaces the old one', async () => {
    mockHindu(hinduFeed(hinduItem('Wheat acreage up', art(1), 'Mon, 26 Oct 2026 10:00:00 +0530'))); mockPib(pibFeed([]));
    await ingestNews({ now: NOW });
    mockHindu(hinduFeed(hinduItem('Wheat acreage up 4%', art(1), 'Mon, 26 Oct 2026 10:00:00 +0530'))); mockPib(pibFeed([]));
    await ingestNews({ now: NOW });
    expect((await NewsItem.find({}).lean()).map((d) => d.title)).toEqual(['Wheat acreage up 4%']);
  });

  test('an item older than the keep time is not stored; a date in the future is not believed', async () => {
    mockHindu(hinduFeed(hinduItem('Old', art(1), 'Mon, 01 Jun 2026 10:00:00 +0530'), hinduItem('Future', art(2), 'Fri, 01 Jan 2027 10:00:00 +0530'))); mockPib(pibFeed([]));
    await ingestNews({ now: NOW });
    const docs = await NewsItem.find({}).lean();
    expect(docs.map((d) => d.title)).toEqual(['Future']);
    expect(docs[0]).toMatchObject({ publishedAt: NOW, dated: false });
  });

  test('one feed down: the other still serves and the refresh succeeds; both down is an error', async () => {
    const warn = jest.spyOn(logger, 'warn');
    mockHindu(HINDU, 503); mockPib(pibFeed(['किसानों के लिए नई सिंचाई योजना']));
    const r = await ingestNews({ now: NOW });
    expect(r.recordCount).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ feed: 'thehindu', reason: '503' }), 'News feed failed');
    mockHindu(HINDU, 503); mockPib('<html>down</html>');
    await expect(ingestNews({ now: NOW })).rejects.toThrow('no news feed answered');
  });

  test('a feed that is not a feed changes nothing already stored', async () => {
    mockHindu(); mockPib();
    await ingestNews({ now: NOW });
    mockHindu('<html>maintenance</html>'); mockPib('');
    await expect(ingestNews({ now: NOW })).rejects.toThrow();
    expect(await NewsItem.countDocuments()).toBe(15);
  });

  test('through the refresh: a first call fetches and records health, a second inside the hour does not fetch', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas';
    mockHindu(); mockPib();
    expect(await refresh('news', { now: NOW })).toBe(true);
    const h = await SourceHealth.findOne({ source: 'news' }).lean();
    expect(h).toMatchObject({ recordCount: 15, errorReason: null });
    expect(await refresh('news', { now: new Date(NOW.getTime() + 600e3) })).toBe(false); // no mock: it would fail if it tried
  });

  test('the kill switch stops the fetch', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'news';
    expect(await refresh('news', { now: NOW })).toBe(false);
    expect(await NewsItem.countDocuments()).toBe(0);
  });
});

describe('choosing what a field sees', () => {
  const seed = async () => {
    const day = (n) => new Date(NOW.getTime() - n * 864e5);
    const mk = (title, over) => ({ key: title, source: 'thehindu', title, link: art(title.length), publishedAt: day(1), dated: true, lang: 'en', states: [], crops: [], expireAt: day(-30), ...over });
    await NewsItem.insertMany([
      mk('General newest', { publishedAt: day(0.1) }),
      mk('General old', { publishedAt: day(5) }),
      mk('Punjab news', { states: ['Punjab'], publishedAt: day(3) }),
      mk('Punjab wheat news', { states: ['Punjab'], crops: ['wheat'], publishedAt: day(4) }),
      mk('Kerala news', { states: ['Kerala'], publishedAt: day(0.2) }),
      mk('Wheat everywhere', { crops: ['wheat'], publishedAt: day(2) }),
      mk('Too old', { publishedAt: day(25) }),
    ]);
  };

  test('this state first, then the crop, then the newest; another state is left out; nothing older than 3 weeks', async () => {
    await seed();
    const items = await newsFor('Punjab', 'wheat', NOW);
    expect(items.map((i) => i.title)).toEqual(['Punjab wheat news', 'Punjab news', 'Wheat everywhere', 'General newest', 'General old']);
    expect(items[0]).toMatchObject({ state: true, crop: true, source: 'thehindu', sourceName: 'The Hindu', dated: true, lang: 'en' });
    expect(items[2]).toMatchObject({ state: false, crop: true });
  });

  test('another crop: the state still first, no crop mark', async () => {
    await seed();
    const items = await newsFor('Punjab', 'rice', NOW);
    expect(items.map((i) => i.title)).toEqual(['Punjab news', 'Punjab wheat news', 'General newest', 'Wheat everywhere', 'General old']);
    expect(items.every((i) => !i.crop)).toBe(true);
  });

  test('a state that is not known sees only news that names no state', async () => {
    await seed();
    const items = await newsFor(null, 'wheat', NOW);
    expect(items.map((i) => i.title)).toEqual(['Wheat everywhere', 'General newest', 'General old']);
  });

  test('at most six items; none yet is an empty list, not an error', async () => {
    expect(await newsFor('Punjab', 'wheat', NOW)).toEqual([]);
    await NewsItem.insertMany(Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, source: 'pib', title: `t${i}`, link: `https://pib.gov.in/p?${i}`, publishedAt: new Date(NOW.getTime() - i * 3600e3), dated: false, lang: 'hi', states: [], crops: [], expireAt: NOW })));
    expect(await newsFor('Punjab', 'wheat', NOW)).toHaveLength(6);
  });
});

describe('the official pages', () => {
  test('every link is https, on a government site, and has an id the screen has words for', () => {
    const { national } = linksFor(null);
    expect(national.length).toBeGreaterThanOrEqual(3);
    for (const l of national) {
      expect(new URL(l.url).protocol).toBe('https:');
      expect(new URL(l.url).hostname).toMatch(/\.gov\.in$/);
      expect(l.id).toMatch(/^[a-z-]+$/);
    }
    expect(linksFor('Punjab').state).toEqual([]);   // state pages are added by hand (docs/FIELD_ALERTS.md)
  });
});

describe('GET /api/fields/:id/news', () => {
  const H_ = 'x-device-id';
  const save = (extra = {}) => request(app).post('/api/fields').set(H_, DEVICE).send({ crop: 'wheat', stage: 'flowering', lat: 30.9012, lon: 75.8573, name: 'North', ...extra });

  test('another device, a bad id, or no device id gets a plain 404 or 400', async () => {
    const id = (await save()).body._id;
    expect((await request(app).get(`/api/fields/${id}/news`).set(H_, '9f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7b')).status).toBe(404);
    expect((await request(app).get('/api/fields/nope/news').set(H_, DEVICE)).status).toBe(404);
    expect((await request(app).get(`/api/fields/${id}/news`)).status).toBe(404);
  });

  test('the state comes from the stored district, the answer holds no place, and the feeds are fetched once', async () => {
    const id = (await save()).body._id;
    await Field.updateOne({ _id: id }, { $set: { district: { lgd: [{ code: 36, name: 'Ludhiana' }], imd: [], at: NOW } } });
    mockHindu(hinduFeed(hinduItem('Wheat sowing in Punjab begins', art(7), 'Mon, 26 Oct 2026 10:00:00 +0530', 'Farmers near Ludhiana'), hinduItem('Kerala rains', art(8), 'Mon, 26 Oct 2026 11:00:00 +0530'))); mockPib(pibFeed([]));
    const res = await request(app).get(`/api/fields/${id}/news`).set(H_, DEVICE);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'Punjab', crop: 'wheat', sources: [{ id: 'thehindu', name: 'The Hindu' }, { id: 'pib', name: 'PIB' }] });
    expect(res.body.items.map((i) => i.title)).toEqual(['Wheat sowing in Punjab begins']);
    expect(res.body.items[0]).toMatchObject({ link: art(7), source: 'thehindu', state: true, crop: true, dated: true });
    expect(res.body.links.national.map((l) => l.id)).toEqual(['imd-bulletin', 'imd-state', 'dafw', 'sachet']);
    expect(JSON.stringify(res.body)).not.toMatch(/30\.9|75\.8|Ludhiana/);
    expect((await request(app).get(`/api/fields/${id}/news`).set(H_, DEVICE)).body.items).toHaveLength(1); // no second fetch: nock has no mock left
  });

  test('both feeds down: still 200, with whatever is stored, and the official pages', async () => {
    const id = (await save()).body._id;
    await Field.updateOne({ _id: id }, { $set: { district: { lgd: [{ code: 36, name: 'Ludhiana' }], imd: [], at: NOW } } });
    mockHindu(HINDU, 500); mockPib(PIB, 500);
    const res = await request(app).get(`/api/fields/${id}/news`).set(H_, DEVICE);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.links.national.length).toBeGreaterThan(0);
  });

  test('with the news switch off there are no items and no fetch', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
    await NewsItem.create({ key: 'a', source: 'thehindu', title: 'Stored', link: art(1), publishedAt: new Date(), dated: true, lang: 'en', states: [], crops: [], expireAt: new Date(Date.now() + 1e6) });
    const id = (await save()).body._id;
    const res = await request(app).get(`/api/fields/${id}/news`).set(H_, DEVICE);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('a field with no district yet is shown general news only', async () => {
    const id = (await save()).body._id;
    mockHindu(hinduFeed(hinduItem('Punjab only', art(1), 'Mon, 26 Oct 2026 10:00:00 +0530'), hinduItem('For everyone', art(2), 'Mon, 26 Oct 2026 09:00:00 +0530'))); mockPib(pibFeed([]));
    const res = await request(app).get(`/api/fields/${id}/news`).set(H_, DEVICE);
    expect(res.body.state).toBeNull();
    expect(res.body.items.map((i) => i.title)).toEqual(['For everyone']);
  });
});
