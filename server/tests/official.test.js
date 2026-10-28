import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Field from '../models/Field.js';
import { ImdWarning, OfficialAlert, SourceHealth } from '../models/OfficialAlert.js';
import { WeatherCache } from '../services/openMeteo.js';
import { parseCap, parseRss, toRecord } from '../services/alerts/cap.js';
import { ingestSachet } from '../services/alerts/sachet.js';
import { ingestImd, inside, parseLayer, resolveDistricts } from '../services/alerts/imd.js';
import { ensureDistricts, ensureFresh, refresh, sourceStatus } from '../services/alerts/ingest.js';
import { officialFor } from '../services/alerts/official.js';
import { lgdFromImd, normKey } from '../utils/districts.js';
import logger from '../utils/logger.js';

// Real documents captured from the live NDMA SACHET feed and IMD's GeoServer on 25 Oct 2026 (tests/fixtures/alerts); the few
// documents marked "synthetic" are written by hand for cases the live feed did not contain (Cancel, a test message, bad XML).
const fx = (p) => readFileSync(new URL(`./fixtures/alerts/${p}`, import.meta.url), 'utf8');
const capIds = readdirSync(new URL('./fixtures/alerts/cap/', import.meta.url)).map((f) => f.replace('.xml', ''));
const NOW = new Date('2026-10-25T05:30:00Z'); // 11:00 in India, Sunday
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const rssText = fx('rss_india.xml').replaceAll('https://sachet.ndma.gov.in', 'http://sachet.test');
const FEED = '/cap_public_website/rss/rss_india.xml';
const CAP = '/cap_public_website/FetchXMLFile';

const mockFeed = (rss = rssText) => nock('http://sachet.test').get(FEED).reply(200, rss);
const mockCap = (id, xml = fx(`cap/${id}.xml`), status = 200) => nock('http://sachet.test').get(CAP).query({ identifier: id }).reply(status, xml);
const mockAllCaps = () => capIds.forEach((id) => mockCap(id));
// `point`: the 0.05° cell query of one field (it has a bbox); otherwise the whole-layer fetch
const mockWfs = (typeName, reply, seen = [], point = true) => nock('http://imd.test').get('/geoserver/wfs').query((q) => { if (q.typeName !== typeName || !!q.bbox !== point) return false; seen.push(q); return true; }).reply(200, reply);

const capXml = ({ id, msgType = 'Alert', status = 'Actual', refs = '', expires = '2026-10-25T12:00:00+05:30', lgd = [36], severity = 'Severe' }) => `<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
<cap:identifier>${id}</cap:identifier><cap:sender>Punjab-SDMA</cap:sender><cap:sent>2026-10-25T10:00:00+05:30</cap:sent>
<cap:status>${status}</cap:status><cap:msgType>${msgType}</cap:msgType><cap:scope>Public</cap:scope><cap:references>${refs}</cap:references>
<cap:info><cap:language>en-IN</cap:language><cap:category>Met</cap:category><cap:event>Thunderstorm</cap:event><cap:urgency>Expected</cap:urgency>
<cap:severity>${severity}</cap:severity><cap:certainty>Likely</cap:certainty><cap:onset>2026-10-25T10:00:00+05:30</cap:onset>${expires ? `<cap:expires>${expires}</cap:expires>` : ''}
<cap:headline>Thunderstorm &amp; lightning at isolated places</cap:headline><cap:instruction>Stay indoors</cap:instruction>
<cap:area><cap:areaDesc>Test</cap:areaDesc>${lgd.map((c) => `<cap:geocode><cap:valueName>LGD District Code</cap:valueName><cap:value>${c}</cap:value></cap:geocode>`).join('')}</cap:area></cap:info></cap:alert>`;
const rssOf = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) => `<item><title>x</title><link>${i.link ?? `http://sachet.test${CAP}?identifier=${i.guid}`}</link><guid isPermaLink="false">${i.guid}</guid><pubDate>${i.pub ?? 'Sun, 25 Oct 2026 04:00:00 GMT'}</pubDate></item>`).join('')}</channel></rss>`;

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/);
});
beforeEach(() => { process.env.ALERTS_DISABLED_SOURCES = 'cwc,glofas,news'; });   // the flood sources and the news have their own tests (flood.test.js, news.test.js)
afterEach(async () => {
  nock.cleanAll();
  jest.restoreAllMocks();
  process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
  await Promise.all([Field, OfficialAlert, ImdWarning, SourceHealth, WeatherCache].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  nock.enableNetConnect();
  await mongoose.disconnect();
  await mongod.stop();
});

describe('district names and codes', () => {
  test('IMD spellings reach the right LGD code, inside their state', () => {
    expect(lgdFromImd('PUNJAB', 'LUDHIANA')).toBe(36);
    expect(lgdFromImd('PUNJAB', 'BHATINDA')).toBe(28);          // IMD "BHATINDA", LGD "Bathinda"
    expect(lgdFromImd('ODISHA', 'KHURDA')).toBe(362);           // LGD "Khordha"
    expect(lgdFromImd('UTTAR PRADESH', 'RAE BAREILLY')).toBe(175); // not Bareilly (130)
    expect(lgdFromImd('UTTAR PRADESH', 'BAREILLY')).toBe(130);
    expect(lgdFromImd('HIMACHAL PRADESH', 'SHIMLA')).toBe(23);
    expect(lgdFromImd('JAMMU & KASHMIR (UT)', 'MIRPUR')).toBeNull(); // Pakistan-administered: no LGD district
    expect(lgdFromImd('NOWHERE', 'NOTHING')).toBeNull();
  });

  test('normalising removes the spellings that differ between the lists, not the districts that differ', () => {
    expect(normKey('ODHISHA', 'Cuttack')).toBe(normKey('Odisha', 'CUTTACK'));
    expect(normKey('TAMILNADU', 'The Nilgiris')).toBe(normKey('Tamil Nadu', 'Nilgiris'));
    expect(normKey('Punjab', 'Bilaspur')).not.toBe(normKey('Himachal Pradesh', 'Bilaspur'));
  });
});

describe('reading SACHET (real documents)', () => {
  test('the RSS list: guid, link, issuer and date of each item; an empty channel is an empty list', () => {
    const items = parseRss(fx('rss_india.xml'));
    expect(items).toHaveLength(17);
    expect(items[0]).toMatchObject({ guid: '1792897745415016', author: expect.stringContaining('CWC') });
    expect(items[0].pubDate).toEqual(new Date('2026-10-25T03:09:06Z'));
    expect(parseRss('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });

  test('a Punjab alert: districts by LGD code, references, two languages, severity', () => {
    const cap = parseCap(fx('cap/1792839894548036.xml'));
    expect(cap).toMatchObject({ identifier: 'IN-1792839894548036_36', sender: 'Punjab-SDMA', msgType: 'Update', status: 'Actual', scope: 'Public', references: ['IN-1792839894548036_53'] });
    expect(cap.infos.map((i) => i.language)).toEqual(['en-IN', 'PN']);
    expect(cap.infos[0].lgd.sort((a, b) => a - b)).toEqual([27, 28, 31, 37, 609]); // Amritsar, Bathinda, Ferozepur, Mansa, Tarn Taran
    const rec = toRecord(cap, '1792839894548036');
    expect(rec).toMatchObject({ severity: 'Severe', event: 'Lightning, Gusty winds, and Thunderstorm', lgd: expect.arrayContaining([27, 609]) });
    expect(rec.expires).toEqual(new Date('2026-10-24T14:02:00Z'));
    expect(rec.infos.find((i) => i.language === 'PN').headline).toMatch(/^ਅਗਲੇ/); // the Punjabi headline is kept
  });

  test('alerts for a mandal or a river station carry no district code', () => {
    expect(toRecord(parseCap(fx('cap/1792827900941008.xml')), 'x').lgd).toEqual([]);   // Andhra Pradesh: mandals
    expect(toRecord(parseCap(fx('cap/1792897745415016.xml')), 'x').lgd).toEqual([]);   // CWC: a river station
  });

  test('identifiers keep all their digits, entities are decoded, a missing expiry becomes 3 hours', () => {
    const rec = toRecord(parseCap(capXml({ id: 'IN-1792839894548036_36', expires: '' })), 'g');
    expect(rec.identifier).toBe('IN-1792839894548036_36');
    expect(rec.infos[0].headline).toBe('Thunderstorm & lightning at isolated places');
    expect(rec.expires).toEqual(new Date(rec.onset.getTime() + 3 * 3600e3));
  });

  test.each([['not xml at all'], ['<html><body>403 Forbidden</body></html>'], ['<cap:alert xmlns:cap="u"><cap:identifier>A</cap:identifier></cap:alert>']])('%s is refused', (body) => {
    expect(() => parseCap(body)).toThrow();
    expect(() => parseRss(body)).toThrow();
  });
});

describe('fetching SACHET', () => {
  test('stores every alert once; a second run fetches no CAP file again', async () => {
    mockFeed(); mockAllCaps();
    const r = await ingestSachet({ now: NOW });
    expect(r).toMatchObject({ recordCount: 17, added: 17, failed: 0 });
    expect(r.newestItemAt).toEqual(new Date('2026-10-25T03:09:06Z'));
    expect(await OfficialAlert.countDocuments()).toBe(17);
    expect(await OfficialAlert.countDocuments({ supersededBy: null })).toBe(15); // two were replaced by their Update (next test)
    expect(nock.isDone()).toBe(true);
    mockFeed(); // no CAP mock: a fetch would fail the test
    expect(await ingestSachet({ now: NOW })).toMatchObject({ added: 0, failed: 0 });
  });

  test('an Update replaces the alert it references (Delhi, Goa), real pairs from the feed', async () => {
    mockFeed(); mockAllCaps();
    await ingestSachet({ now: NOW });
    const ids = (await OfficialAlert.find({ supersededBy: null }, 'identifier').lean()).map((d) => d.identifier);
    expect(ids).toContain('IN-1792868873415022_48');
    expect(ids).not.toContain('IN-1792868303431022_48');       // Delhi: replaced
    expect(ids).toContain('IN-1792836780086033_55');
    expect(ids).not.toContain('IN-1792831419331033_55');       // Goa: replaced
  });

  test('a Cancel removes what it references (synthetic) and is itself never shown', async () => {
    const t = [{ guid: '1', pub: 'Sun, 25 Oct 2026 04:00:00 GMT' }, { guid: '2', pub: 'Sun, 25 Oct 2026 04:30:00 GMT' }];
    mockFeed(rssOf(t));
    mockCap('1', capXml({ id: 'A1' })); mockCap('2', capXml({ id: 'A2', msgType: 'Cancel', refs: 'Punjab-SDMA,A1,2026-10-25T10:00:00+05:30' }));
    await ingestSachet({ now: NOW });
    expect((await OfficialAlert.find({ supersededBy: null }).lean()).map((d) => d.identifier)).toEqual(['A2']); // the Cancel itself, kept so it is not fetched again
    const f = { _id: new mongoose.Types.ObjectId(), district: { lgd: [{ code: 36 }], imd: [] } };
    expect((await officialFor([f], NOW)).get(String(f._id))).toEqual([]);
  });

  test('an item is applied in the order it was published, whatever order the feed lists it', async () => {
    mockFeed(rssOf([{ guid: '2', pub: 'Sun, 25 Oct 2026 04:30:00 GMT' }, { guid: '1', pub: 'Sun, 25 Oct 2026 04:00:00 GMT' }])); // newest first
    mockCap('1', capXml({ id: 'A1' })); mockCap('2', capXml({ id: 'A2', msgType: 'Update', refs: 'Punjab-SDMA,A1,x' }));
    await ingestSachet({ now: NOW });
    expect((await OfficialAlert.find({ supersededBy: null }).lean()).map((d) => d.identifier)).toEqual(['A2']);
  });

  test('an older alert that turns up after its Update is superseded on arrival, not shown again', async () => {
    mockFeed(rssOf([{ guid: '2' }])); mockCap('2', capXml({ id: 'A2', msgType: 'Update', refs: 'Punjab-SDMA,A1,x' }));
    await ingestSachet({ now: NOW });
    mockFeed(rssOf([{ guid: '2' }, { guid: '1' }])); mockCap('1', capXml({ id: 'A1' }));
    expect(await ingestSachet({ now: NOW })).toMatchObject({ added: 1 });
    expect((await OfficialAlert.findOne({ identifier: 'A1' }).lean()).supersededBy).toBe('A2');
    expect((await OfficialAlert.find({ supersededBy: null }).lean()).map((d) => d.identifier)).toEqual(['A2']);
  });

  test('one unreadable CAP file does not stop the others and is counted', async () => {
    mockFeed(rssOf([{ guid: '1' }, { guid: '2' }, { guid: '3' }]));
    mockCap('1', capXml({ id: 'A1' })); mockCap('2', '<html>oops</html>'); mockCap('3', capXml({ id: 'A3' }));
    expect(await ingestSachet({ now: NOW })).toMatchObject({ added: 2, failed: 1 });
    expect(await OfficialAlert.countDocuments()).toBe(2);
  });

  test('when every CAP file fails, it is an error (so the health record says so)', async () => {
    mockFeed(rssOf([{ guid: '11' }, { guid: '12' }]));
    mockCap('11', 'x', 500); mockCap('12', 'x', 403);
    await expect(ingestSachet({ now: NOW })).rejects.toThrow('no CAP file could be read');
  });

  test.each([[403], [500], [404]])('the feed answering %i is an error', async (status) => {
    nock('http://sachet.test').get(FEED).reply(status, 'no');
    await expect(ingestSachet({ now: NOW })).rejects.toBeTruthy();
  });

  test('a timeout and an HTML page in place of the feed are errors', async () => {
    nock('http://sachet.test').get(FEED).replyWithError({ code: 'ETIMEDOUT' });
    await expect(ingestSachet({ now: NOW })).rejects.toBeTruthy();
    nock('http://sachet.test').get(FEED).reply(200, '<html>maintenance</html>');
    await expect(ingestSachet({ now: NOW })).rejects.toThrow('not an RSS feed');
  });

  test('an empty feed is fine; items older than 2 days are not fetched; links to another host are not followed', async () => {
    mockFeed(rssOf([]));
    expect(await ingestSachet({ now: NOW })).toMatchObject({ recordCount: 0, added: 0 });
    mockFeed(rssOf([{ guid: 'old', pub: 'Thu, 22 Oct 2026 04:00:00 GMT' }, { guid: 'evil', link: 'http://evil.test/steal' }]));
    expect(await ingestSachet({ now: NOW })).toMatchObject({ recordCount: 2, added: 0, failed: 0 }); // nothing requested: nock has no mock for them
  });
});

describe('IMD district warnings (real layer rows)', () => {
  test('rows are read with IMD\'s own meaning of codes and colours', () => {
    const rows = parseLayer(JSON.parse(fx('imd_layer.json')));
    expect(rows).toHaveLength(22);
    const palakkad = rows.find((r) => r.imdId === 1847);
    expect(palakkad.days.slice(0, 3)).toEqual([{ n: 1, color: 2, codes: [16, 4] }, { n: 2, color: 1, codes: [17, 4] }, { n: 3, color: 3, codes: [2, 4] }]);
    expect(rows.find((r) => r.imdId === 1593).days.every((d) => d.color === 4 && d.codes.length === 0)).toBe(true); // Ludhiana: green, code 1 = no warning
    expect(parseLayer({})).toEqual([]);
    // the layer's "2026-10-24T12:16:09Z" is India time: 06:46:09 UTC
    expect(rows.find((r) => r.imdId === 1593).updatedAt).toEqual(new Date('2026-10-24T06:46:09Z'));
  });

  test('the whole layer is stored by IMD\'s id and a second run replaces rows instead of adding', async () => {
    mockWfs('imd:district_warnings_india', fx('imd_layer.json'), [], false);
    const r = await ingestImd({ now: NOW });
    expect(r.recordCount).toBe(22);
    expect(r.newestItemAt).toEqual(new Date('2026-10-25T04:10:31Z')); // IMD's 09:40:31"Z" is India time
    mockWfs('imd:district_warnings_india', fx('imd_layer.json'), [], false);
    await ingestImd({ now: NOW });
    expect(await ImdWarning.countDocuments()).toBe(22);
  });

  test('an empty or broken layer is an error', async () => {
    mockWfs('imd:district_warnings_india', { type: 'FeatureCollection', features: [] }, [], false);
    await expect(ingestImd({ now: NOW })).rejects.toThrow('empty warnings layer');
    nock('http://imd.test').get('/geoserver/wfs').query(true).reply(200, '<html>login</html>');
    await expect(ingestImd({ now: NOW })).rejects.toBeTruthy();
  });

  test('a point resolves to its district and LGD code, asking IMD only for the 5 km cell', async () => {
    const seen = [];
    mockWfs('imd:district_warnings_india', fx('bbox_warn_ludhiana.json'), seen);
    mockWfs('imd:india_districts', fx('bbox_dist_ludhiana.json'), seen);
    const d = await resolveDistricts(30.9012, 75.8573);
    expect(d).toEqual({ imd: [{ id: 1593, name: 'LUDHIANA' }], lgd: [{ code: 36, name: 'Ludhiana', state: 'Punjab' }] });
    expect(seen.map((q) => q.bbox)).toEqual(['75.8250,30.8750,75.8750,30.9250,EPSG:4326', '75.8250,30.8750,75.8750,30.9250,EPSG:4326']);
    expect(JSON.stringify(seen)).not.toMatch(/30\.9012|75\.8573/);
  });

  test('when no returned shape holds the point (generalised borders), every district under the cell is kept, each in both lists', async () => {
    mockWfs('imd:district_warnings_india', fx('bbox_warn_cuttack.json'));
    mockWfs('imd:india_districts', fx('bbox_dist_cuttack.json'));
    const d = await resolveDistricts(20.4625, 85.883);
    expect(d.imd.map((x) => x.name).sort()).toEqual(['CUTTACK', 'KHORDHA']);       // IMD's warning layer spells it KHORDHA
    expect(d.lgd.map((x) => [x.code, x.name]).sort()).toEqual([[350, 'Cuttack'], [362, 'Khordha']]); // its district layer KHURDA
    mockWfs('imd:district_warnings_india', fx('geo_warn_shimla.json'));
    mockWfs('imd:india_districts', fx('geo_dist_shimla.json'));
    expect((await resolveDistricts(20.0, 70.0)).lgd.map((x) => x.name).sort()).toEqual(['Shimla', 'Solan']); // a point in neither shape
  });

  test('IMD answers with every district whose bounding box touches the cell; the exact point picks the one it is in (real shapes)', async () => {
    mockWfs('imd:district_warnings_india', fx('geo_warn_shimla.json'));
    mockWfs('imd:india_districts', fx('geo_dist_shimla.json'));
    expect(await resolveDistricts(31.1048, 77.1734)).toEqual({ imd: [{ id: 1606, name: 'SHIMLA' }], lgd: [{ code: 23, name: 'Shimla', state: 'Himachal Pradesh' }] }); // not Solan
    mockWfs('imd:district_warnings_india', fx('geo_warn_palakkad.json'));
    mockWfs('imd:india_districts', fx('geo_dist_palakkad.json'));
    const d = await resolveDistricts(10.7867, 76.6548); // the cell also touches the envelopes of Coimbatore and Thrissur
    expect(d.imd.map((x) => x.name)).toEqual(['PALAKKAD']);
    expect(d.lgd.map((x) => x.name)).toEqual(['Palakkad']);
  });

  test('the shape test copes with holes and several parts', () => {
    const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const g = { type: 'MultiPolygon', coordinates: [[sq(0, 0, 10, 10), sq(4, 4, 6, 6)], [sq(20, 20, 30, 30)]] };
    expect([inside(g, 1, 1), inside(g, 5, 5), inside(g, 25, 25), inside(g, 15, 15)]).toEqual([true, false, true, false]);
    expect(inside({ type: 'Point', coordinates: [1, 1] }, 1, 1)).toBe(false);
    expect(inside(null, 1, 1)).toBe(false);
  });

  test('a point at sea has no district, and a down service is an error, not an empty answer', async () => {
    mockWfs('imd:district_warnings_india', fx('bbox_warn_sea.json'));
    mockWfs('imd:india_districts', fx('bbox_warn_sea.json'));
    expect(await resolveDistricts(15.05, 70.05)).toEqual({ imd: [], lgd: [] });
    nock('http://imd.test').get('/geoserver/wfs').query(true).times(2).reply(503);
    await expect(resolveDistricts(15.05, 70.05)).rejects.toBeTruthy();
  });
});

const seedImd = () => ImdWarning.insertMany(parseLayer(JSON.parse(fx('imd_layer.json'))).map((r) => ({ ...r, fetchedAt: NOW })));
const fieldAt = (district) => ({ _id: new mongoose.Types.ObjectId(), district });
const cuttack = { imd: [{ id: 1433, name: 'CUTTACK' }, { id: 1910, name: 'KHORDHA' }], lgd: [{ code: 350 }, { code: 362 }] };
const palakkad = { imd: [{ id: 1847, name: 'PALAKKAD' }], lgd: [] };
const ludhiana = { imd: [{ id: 1593, name: 'LUDHIANA' }], lgd: [{ code: 36 }] };

describe('official warnings for a field', () => {
  test('IMD: today, tomorrow and the day after, worst first, with IMD\'s own levels and hazards', async () => {
    await seedImd();
    const f = fieldAt(palakkad);
    const out = (await officialFor([f], NOW)).get(String(f._id));
    expect(out.map((a) => [a.date, a.level, a.codes])).toEqual([['2026-10-26', 'urgent', [17, 4]], ['2026-10-25', 'warn', [16, 4]], ['2026-10-27', 'watch', [2, 4]]]);
    expect(out[0]).toMatchObject({ id: 'IMD|2026-10-26', origin: 'official', source: 'imd', issuer: 'IMD', family: 'rain', offset: 1, from: '2026-10-26T00:00', to: '2026-10-27T00:00', districts: ['PALAKKAD'] });
    expect(out[0].issuedAt).toBe('2026-10-24T08:32:02.000Z'); // the layer says 14:02:02Z, which is India time
    expect(out[0].expires).toBe('2026-10-26T18:30:00.000Z'); // the end of the 26th in India
  });

  test('a green district has no official alert; a day beyond the third is not shown', async () => {
    await seedImd();
    const f = fieldAt(ludhiana);
    expect((await officialFor([f], NOW)).get(String(f._id))).toEqual([]);
    const c = fieldAt(cuttack);
    // Cuttack: day 3 yellow, day 4 and 5 orange; only the 27th (day 3) is within three days
    expect((await officialFor([c], NOW)).get(String(c._id)).map((a) => [a.date, a.level])).toEqual([['2026-10-27', 'watch']]);
  });

  test('two districts under one cell: one alert per day with the higher level and every hazard', async () => {
    await seedImd();
    await ImdWarning.updateOne({ imdId: 1910 }, { $set: { 'days.2.color': 1, 'days.2.codes': [8] } });
    const f = fieldAt(cuttack);
    const [a] = (await officialFor([f], NOW)).get(String(f._id));
    expect(a).toMatchObject({ date: '2026-10-27', level: 'urgent', codes: expect.arrayContaining([2, 4, 8]) });
    expect(a.districts.sort()).toEqual(['CUTTACK', 'KHORDHA']);
  });

  test('rows IMD has not updated for a day and a half, or that were re-keyed under the same id, are not used', async () => {
    await seedImd();
    const f = fieldAt(palakkad);
    expect((await officialFor([f], new Date('2026-10-27T05:30:00Z'))).get(String(f._id))).toEqual([]);          // updated 24 Oct 14:02 India time: 69 h before
    expect((await officialFor([fieldAt({ imd: [{ id: 1847, name: 'THRISSUR' }], lgd: [] })], NOW)).values().next().value).toEqual([]); // name changed
    expect((await officialFor([fieldAt({ imd: [{ id: 2089, name: 'YANAM' }], lgd: [] })], NOW)).values().next().value).toEqual([]);     // a 2023 row
  });

  const ingestFixtures = async () => { mockFeed(); mockAllCaps(); await ingestSachet({ now: new Date('2026-10-24T11:30:00Z') }); };

  test('SACHET: an alert reaches a field in a named district and not one in another (Punjab)', async () => {
    await ingestFixtures();
    const at = new Date('2026-10-24T11:30:00Z'); // 17:00 in India, the alert runs 16:38 to 19:32
    const amritsar = fieldAt({ imd: [], lgd: [{ code: 27 }] });
    const ludh = fieldAt(ludhiana);
    const m = await officialFor([amritsar, ludh], at);
    const [a] = m.get(String(amritsar._id));
    expect(a).toMatchObject({ id: 'SACHET|IN-1792839894548036_36', source: 'sachet', issuer: 'Punjab SDMA', level: 'warn', family: 'storm', event: 'Lightning, Gusty winds, and Thunderstorm', offset: 0,
      date: '2026-10-24', from: '2026-10-24T17:00', to: '2026-10-24T19:32', cap: { msgType: 'Update', severity: 'Severe', urgency: 'Expected', certainty: 'Possible', identifier: 'IN-1792839894548036_36' } });
    expect(a.headlines.en).toMatch(/Thunderstorm with Lightning/);
    expect(a.headlines.pn).toMatch(/^ਅਗਲੇ/);
    expect(a.link).toBe('https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=1792839894548036');
    expect(m.get(String(ludh._id)).filter((x) => x.source === 'sachet')).toEqual([]);
  });

  test('SACHET: a Rajasthan alert for 11 districts reaches Alwar and not Jaipur', async () => {
    await ingestFixtures();
    const at = new Date('2026-10-24T11:30:00Z');
    const alwar = fieldAt({ imd: [], lgd: [{ code: 87 }] });
    const jaipur = fieldAt({ imd: [], lgd: [{ code: 102 }] });
    const m = await officialFor([alwar, jaipur], at);
    expect(m.get(String(alwar._id)).map((a) => [a.issuer, a.level])).toEqual([['Rajasthan SDMA', 'watch']]);
    expect(m.get(String(jaipur._id))).toEqual([]);
  });

  test('SACHET: an expired alert, a test message and one starting more than 3 days away are not shown', async () => {
    await ingestFixtures();
    const f = fieldAt({ imd: [], lgd: [{ code: 27 }] });
    expect((await officialFor([f], new Date('2026-10-24T14:30:00Z'))).get(String(f._id))).toEqual([]);  // after 19:32
    await OfficialAlert.deleteMany({});
    await OfficialAlert.insertMany([
      { ...toRecord(parseCap(capXml({ id: 'T1', status: 'Test', lgd: [27] })), 't1'), expires: new Date('2026-10-25T12:00:00Z') },
      { ...toRecord(parseCap(capXml({ id: 'F1', lgd: [27] })), 'f1'), onset: new Date('2026-10-30T00:00:00Z'), expires: new Date('2026-10-31T00:00:00Z') },
      { ...toRecord(parseCap(capXml({ id: 'OK', lgd: [27], severity: 'Extreme' })), 'ok'), expires: new Date('2026-10-25T12:00:00Z') },
    ]);
    expect((await officialFor([f], NOW)).get(String(f._id)).map((a) => [a.id, a.level])).toEqual([['SACHET|OK', 'urgent']]);
  });

  test('SACHET and IMD together: worst first, soonest first on a tie, at most 6', async () => {
    await seedImd();
    await OfficialAlert.insertMany(Array.from({ length: 8 }, (_, i) => ({ ...toRecord(parseCap(capXml({ id: `W${i}`, lgd: [36], severity: i === 0 ? 'Extreme' : 'Moderate' })), `w${i}`), expires: new Date('2026-10-25T12:00:00Z') })));
    const f = fieldAt({ ...ludhiana });
    const out = (await officialFor([f], NOW)).get(String(f._id));
    expect(out).toHaveLength(6);
    expect(out[0]).toMatchObject({ id: 'SACHET|W0', level: 'urgent' });
  });
});

describe('keeping the sources fresh', () => {
  const sachetOnce = () => { mockFeed(rssOf([{ guid: 'a1' }])); mockCap('a1', capXml({ id: 'A1' })); };

  test('a due source is fetched and its health recorded; a second call inside the interval does nothing', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'imd,cwc,glofas';
    sachetOnce();
    expect(await refresh('sachet', { now: NOW })).toBe(true);
    const h = await SourceHealth.findOne({ source: 'sachet' }).lean();
    expect(h).toMatchObject({ fetchedAt: NOW, recordCount: 1, errorReason: null, leaseUntil: null });
    expect(await refresh('sachet', { now: new Date(NOW.getTime() + 5 * 60e3) })).toBe(false); // 5 min later: not due, no request (nock has none)
    sachetOnce();
    expect(await refresh('sachet', { now: new Date(NOW.getTime() + 11 * 60e3) })).toBe(true);
  });

  test('`force` fetches even when not due; two callers at once make one fetch', async () => {
    sachetOnce();
    const both = await Promise.all([refresh('sachet', { force: true, now: NOW }), refresh('sachet', { force: true, now: NOW })]);
    expect(both).toEqual([true, true]);
    expect(nock.isDone()).toBe(true); // a second fetch would have failed on the missing mock
  });

  test('another instance holding the lease means this one does not fetch', async () => {
    await SourceHealth.create({ source: 'sachet', attemptedAt: new Date(NOW.getTime() - 3600e3), leaseUntil: new Date(NOW.getTime() + 60e3) });
    expect(await refresh('sachet', { now: NOW })).toBe(false);
    expect(await refresh('sachet', { now: new Date(NOW.getTime() + 120e3) })).toBe(false); // lease over but the nock has no feed -> fails quietly
  });

  test('a failed fetch records why and never throws; the source then reads as down', async () => {
    nock('http://sachet.test').get(FEED).reply(500, 'x');
    expect(await refresh('sachet', { now: NOW })).toBe(false);
    const h = await SourceHealth.findOne({ source: 'sachet' }).lean();
    expect(h).toMatchObject({ errorReason: '500', leaseUntil: null });
    expect(h.fetchedAt).toBeUndefined();
    expect((await sourceStatus(NOW)).find((s) => s.source === 'sachet')).toMatchObject({ state: 'down', fetchedAt: null, errorReason: '500' });
  });

  test('ok within the interval, delayed after it, down after 6 hours; the kill switch says disabled', async () => {
    await SourceHealth.create([{ source: 'sachet', fetchedAt: new Date(NOW.getTime() - 20 * 60e3) }, { source: 'imd', fetchedAt: new Date(NOW.getTime() - 2 * 3600e3) }]);
    const st = async (at) => Object.fromEntries((await sourceStatus(at)).map((s) => [s.source, s.state]));
    expect(await st(NOW)).toEqual({ sachet: 'ok', imd: 'delayed', cwc: 'disabled', news: 'disabled' });
    expect(await st(new Date(NOW.getTime() + 2 * 3600e3))).toEqual({ sachet: 'delayed', imd: 'delayed', cwc: 'disabled', news: 'disabled' });
    expect(await st(new Date(NOW.getTime() + 7 * 3600e3))).toEqual({ sachet: 'down', imd: 'down', cwc: 'disabled', news: 'disabled' });
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,cwc,glofas';
    expect((await st(NOW)).sachet).toBe('disabled');
    expect(await refresh('sachet', { force: true, now: NOW })).toBe(false); // nothing requested
  });

  test('ensureFresh gives up waiting after its budget but lets the fetch finish', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'imd,cwc,glofas';
    nock('http://sachet.test').get(FEED).delay(400).reply(200, rssOf([]));
    const t0 = Date.now();
    await ensureFresh({ budgetMs: 50, now: NOW });
    expect(Date.now() - t0).toBeLessThan(300);
    await new Promise((r) => setTimeout(r, 600));
    expect((await SourceHealth.findOne({ source: 'sachet' }).lean()).fetchedAt).toEqual(NOW);
  });

  test('a field gets its districts once; a failure is remembered for 15 minutes; the kill switch skips the lookup', async () => {
    const f = await Field.create({ userId: new mongoose.Types.ObjectId(), deviceId: DEVICE, crop: 'wheat', stage: 'flowering', location: { type: 'Point', coordinates: [75.8573, 30.9012] } });
    mockWfs('imd:district_warnings_india', fx('bbox_warn_ludhiana.json'));
    mockWfs('imd:india_districts', fx('bbox_dist_ludhiana.json'));
    const lean = await Field.find({}).lean();
    await ensureDistricts(lean, NOW);
    expect(lean[0].district).toMatchObject({ imd: [{ id: 1593 }], lgd: [{ code: 36 }], at: NOW });
    expect((await Field.findById(f._id).lean()).district.lgd[0].code).toBe(36);
    await ensureDistricts(lean, NOW); // already known: no request (nock has none left)

    await Field.updateOne({ _id: f._id }, { $unset: { district: 1 } });
    const again = await Field.find({}).lean();
    nock('http://imd.test').get('/geoserver/wfs').query(true).times(2).reply(503);
    await ensureDistricts(again, NOW);
    expect(again[0].districtTriedAt).toEqual(NOW);
    await ensureDistricts(again, new Date(NOW.getTime() + 5 * 60e3)); // 5 min later: not asked again
    expect(nock.pendingMocks()).toHaveLength(0); // the two 503s were used by the first try only
    process.env.ALERTS_DISABLED_SOURCES = 'imd,cwc,glofas';
    const third = [{ ...again[0], districtTriedAt: undefined }];
    await ensureDistricts(third, NOW);
    expect(third[0].district).toBeUndefined();
  });
});

describe('GET /api/fields/alerts with official warnings', () => {
  const LAT = 30.9012;
  const LON = 75.8573;
  const pad = (n) => String(n).padStart(2, '0');
  const add = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const meteo = () => {
    const today = new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
    const time = [];
    for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${add(today, i)}T${pad(h)}:00`);
    return { utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: time.map(() => 18), relative_humidity_2m: time.map(() => 60), precipitation: time.map(() => 0) } };
  };
  const mockMeteo = () => nock('http://meteo.test').get('/v1/forecast').query(true).reply(200, meteo());
  const save = () => request(app).post('/api/fields').set('x-device-id', DEVICE).send({ crop: 'wheat', stage: 'flowering', lat: LAT, lon: LON, name: 'North' });
  const alerts = () => request(app).get('/api/fields/alerts').set('x-device-id', DEVICE);
  const mockImdPoint = () => { mockWfs('imd:district_warnings_india', fx('bbox_warn_ludhiana.json')); mockWfs('imd:india_districts', fx('bbox_dist_ludhiana.json')); };

  test('official sources off (the default in these tests): the answer has an empty list and no source information to show', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news';
    await save(); mockMeteo();
    const res = await alerts();
    expect(res.status).toBe(200);
    expect(res.body.fields[0].official).toEqual([]);
    expect(res.body.officialSources.map((s) => s.state)).toEqual(['disabled', 'disabled', 'disabled']);
  });

  test('a first look fetches both sources and the field\'s districts, and an IMD warning appears on its field', async () => {
    await save(); mockMeteo();
    mockImdPoint();
    mockFeed(rssOf([])); // SACHET: nothing new
    nock('http://imd.test').get('/geoserver/wfs').query((q) => q.typeName === 'imd:district_warnings_india' && !q.bbox).reply(200,
      JSON.stringify({ type: 'FeatureCollection', features: JSON.parse(fx('imd_layer.json')).features.map((f) => (f.properties.ID === 1593
        ? { ...f, properties: { ...f.properties, updated_at: new Date().toISOString(), Day_1: '4', Day1_Color: 3 } } : f)) }));
    const res = await alerts();
    expect(res.status).toBe(200);
    const [field] = res.body.fields;
    expect(field.official).toHaveLength(1);
    expect(field.official[0]).toMatchObject({ source: 'imd', level: 'watch', codes: [4], family: 'storm', districts: ['LUDHIANA'] });
    expect(res.body.officialSources.map((s) => [s.source, s.state])).toEqual([['sachet', 'ok'], ['imd', 'ok'], ['cwc', 'disabled']]);
    expect(field.alerts).toEqual([]); // our own weather alerts are unchanged
    // the field now remembers its districts and the answer never shows them or the place
    expect((await Field.findOne({}).lean()).district.lgd[0].code).toBe(36);
    expect(JSON.stringify(res.body)).not.toMatch(/30\.9012|75\.8573|"district"|"lgd"|"imdId"/);
  });

  test('weather down, official warnings still shown', async () => {
    await save();
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    await Field.updateOne({}, { $set: { district: { ...ludhiana, at: NOW } } });
    await seedImd();
    await ImdWarning.updateOne({ imdId: 1593 }, { $set: { updatedAt: new Date(), 'days.0.color': 2, 'days.0.codes': [16] } });
    mockFeed(rssOf([]));
    nock('http://imd.test').get('/geoserver/wfs').query(true).reply(503);
    const res = await alerts();
    expect(res.body.fields[0]).toMatchObject({ status: 'weather_unavailable', official: [{ source: 'imd', level: 'warn', codes: [16], family: 'rain' }] });
  });

  test('both official sources failing never fails the answer; they read as down', async () => {
    await save(); mockMeteo();
    nock('http://sachet.test').get(FEED).reply(500);
    nock('http://imd.test').get('/geoserver/wfs').query(true).times(3).reply(503);
    const res = await alerts();
    expect(res.status).toBe(200);
    expect(res.body.fields[0]).toMatchObject({ status: 'ok', official: [] });
    expect(res.body.officialSources.map((s) => s.state)).toEqual(['down', 'down', 'disabled']);
  });

  test('someone else\'s browser sees none of it', async () => {
    await save(); mockMeteo();
    const res = await request(app).get('/api/fields/alerts').set('x-device-id', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(res.body.fields).toEqual([]);
    expect(res.body.officialSources).toEqual([]);
  });
});

describe('operator routes', () => {
  const H = 'x-alerts-token';
  test('without the secret configured they answer 503, with a wrong secret 401', async () => {
    const saved = process.env.ALERTS_ADMIN_TOKEN;
    delete process.env.ALERTS_ADMIN_TOKEN;
    expect((await request(app).get('/api/alerts/health').set(H, 'x')).status).toBe(503);
    process.env.ALERTS_ADMIN_TOKEN = saved;
    expect((await request(app).get('/api/alerts/health')).status).toBe(401);
    expect((await request(app).get('/api/alerts/health').set(H, 'wrong')).status).toBe(401);
    expect((await request(app).post('/api/alerts/tick').set(H, 'test-alerts-token-x')).status).toBe(401);
  });

  test('health shows each source; a tick fetches them now and reports', async () => {
    const h = await request(app).get('/api/alerts/health').set(H, 'test-alerts-token');
    expect(h.status).toBe(200);
    expect(h.body.sources.map((s) => [s.source, s.state])).toEqual([['sachet', 'down'], ['imd', 'down'], ['cwc', 'disabled'], ['news', 'disabled']]);
    mockFeed(rssOf([]));
    mockWfs('imd:district_warnings_india', fx('imd_layer.json'), [], false);
    const t = await request(app).post('/api/alerts/tick').set(H, 'test-alerts-token');
    expect(t.status).toBe(200);
    expect(t.body.sources.map((s) => [s.source, s.state, s.recordCount])).toEqual([['sachet', 'ok', 0], ['imd', 'ok', 22], ['cwc', 'disabled', null], ['news', 'disabled', null]]);
    expect(t.body.sources[1].newestItemAt).toBeTruthy();
  });

  test('nothing in the logs names a place when the district lookup fails', async () => {
    const spy = jest.spyOn(logger, 'warn');
    await Field.create({ userId: new mongoose.Types.ObjectId(), deviceId: DEVICE, crop: 'wheat', stage: 'flowering', location: { type: 'Point', coordinates: [75.8573, 30.9012] } });
    nock('http://imd.test').get('/geoserver/wfs').query(true).times(2).reply(503);
    await ensureDistricts(await Field.find({}).lean(), NOW);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/30\.9|75\.8/);
    expect(spy).toHaveBeenCalled();
  });
});
