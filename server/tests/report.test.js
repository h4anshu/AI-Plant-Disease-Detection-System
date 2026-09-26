// PDF field report (docs/REPORT.md): the content snapshot, tracing of every value to an API field,
// fonts that can draw every character, the tamper hash, and the routes.
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import sharp from 'sharp';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import Report from '../models/Report.js';
import FieldHealthCache, { keyForPrediction } from '../models/FieldHealthCache.js';
import { WeatherCache } from '../services/openMeteo.js';
import { parseLocation } from '../utils/geo.js';
import { buildReport, contentHash, sourceRows } from '../utils/reportContent.js';
import { missingGlyphs, renderReport, runs } from '../utils/reportPdf.js';
import { fieldHealth, input, prediction } from './reportFixtures.js';

const pages = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
const sections = (c) => Object.fromEntries(c.sections.map((s) => [s.id, s]));
const value = (c, id, label) => sections(c)[id].rows.find((r) => r.label === label)?.value;

describe('report content', () => {
  test.each(['en', 'hi'])('snapshot (%s)', (lang) => {
    expect(buildReport(input({ lang }))).toMatchSnapshot();
  });

  test('every value names the API field it comes from', () => {
    const c = buildReport(input());
    const rows = sourceRows(c);
    expect(rows.length).toBeGreaterThan(25);
    for (const r of rows) expect(r.source).toMatch(/^(GET \/api\/predict(\/:id\/(field-health|disease-risk))? › |stored checkup |report record › )/);
  });

  test('the numbers are the API numbers, formatted', () => {
    const c = buildReport(input());
    expect(value(c, 'diagnosis', 'Model confidence')).toBe(`${(prediction.confidence * 100).toFixed(1)}%`);
    const sure = buildReport(input({ prediction: { ...prediction, confidence: 0.99986 } }));
    expect(value(sure, 'diagnosis', 'Model confidence')).toBe('> 99.9%'); // never a certain-looking 100.0%
    expect(value(c, 'diagnosis', 'Estimated yield loss if untreated')).toBe('25% (high confidence)');
    expect(value(c, 'diagnosis', 'Other possibilities')).toBe('Brownspot 5.1%, Healthy 1.2%');
    expect(value(c, 'field', 'Verdict')).toBe('Below neighbouring fields since 13 Sept 2026.');
    expect(value(c, 'field', 'Last clear image')).toBe('18 Sept 2026');
    expect(value(c, 'field', 'Clear images')).toBe('4 of 31');
    expect(value(c, 'field', 'Latest field NDVI / NDRE')).toBe('0.55 / 0.27 (18 Sept 2026)');
    expect(value(c, 'field', 'Farmland share of the 30 m circle')).toBe('94%');
    expect(sections(c).field.chart.points).toHaveLength(fieldHealth.series.filter((s) => s.used).length);
    expect(value(c, 'risk', 'Infection hours today')).toBe('4 (3 = medium, 6 = high)');
    expect(sections(c).risk.days.map((d) => d.levelText)).toEqual(['Low', 'Medium', 'Medium', 'High', 'High', '–']);
    expect(c.header.find((r) => r.label === 'Checkup date').value).toBe('20 Sept 2026, 11:00 IST'); // 05:30 UTC
  });

  test('the location is rounded to 0.01° and the exact point appears nowhere', () => {
    const c = buildReport(input());
    expect(value(c, 'location', 'Location (rounded to about 1 km)')).toBe('30.91° N, 75.81° E');
    expect(JSON.stringify(c)).not.toMatch(/30\.912|75\.806/);
  });

  test('missing parts say so instead of guessing', () => {
    const noLoc = sections(buildReport(input({ location: null })));
    expect(noLoc.location.notes[0]).toMatch(/No location was shared/);
    expect(noLoc.field).toBeUndefined();
    expect(noLoc.risk).toBeUndefined();
    const notChecked = sections(buildReport(input({ fieldHealth: null })));
    expect(notChecked.field.notes[0]).toMatch(/never starts a new satellite check/);
    const noWeather = sections(buildReport(input({ risk: { unavailable: true, disease: 'blast' } })));
    expect(noWeather.risk.notes[0]).toMatch(/Weather data was unavailable/);
    const noMap = sections(buildReport(input({ images: { photo: 'a', gradcam: null, map: null } })));
    expect(noMap.location.map).toBeNull();
    expect(noMap.images.note).toMatch(/No heatmap/);
    const uncertain = buildReport(input({ prediction: { ...prediction, status: 'uncertain', yieldLossPercent: null, yieldLossConfidence: null, treatment: null } }));
    expect(value(uncertain, 'diagnosis', 'Result status')).toMatch(/Uncertain/);
    expect(value(uncertain, 'diagnosis', 'Estimated yield loss if untreated')).toMatch(/Not estimated/);
  });

  test('hash: the same for the same content, whatever the key order; any change changes it', () => {
    const c = buildReport(input());
    const h = contentHash(c);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const reversed = (v) => (Array.isArray(v) ? v.map(reversed)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)])) : v);
    expect(JSON.stringify(reversed(c))).not.toBe(JSON.stringify(c));
    expect(contentHash(reversed(c))).toBe(h);
    const edited = structuredClone(c);
    sections(edited).diagnosis.rows[2].value = '99.9%';
    expect(contentHash(edited)).not.toBe(h);
  });

  test('the fonts can draw every character: both languages, every crop, disease and severity name', () => {
    const terms = JSON.parse(readFileSync(new URL('../assets/terms.json', import.meta.url), 'utf8'));
    expect(missingGlyphs(JSON.stringify(terms))).toEqual([]);
    for (const lang of ['en', 'hi']) expect(missingGlyphs(JSON.stringify(buildReport(input({ lang }))))).toEqual([]);
    expect(missingGlyphs('a → b')).toEqual(['→']); // the check itself works
  });

  test('server copy of the crop/disease names equals the app\'s (client/src/locales/terms.json)', () => {
    const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
    expect(JSON.parse(read('../assets/terms.json'))).toEqual(JSON.parse(read('../../client/src/locales/terms.json')));
  });
});

describe('report PDF', () => {
  test('mixed Hindi/English text is split into font runs; leading digits follow the first word', () => {
    expect(runs('धान का झोंका (Blast) 87%')).toEqual([{ font: 'D', text: 'धान का झोंका (' }, { font: 'L', text: 'Blast) 87%' }]);
    expect(runs('24 सित॰')).toEqual([{ font: 'D', text: '24 सित॰' }]);
  });

  test.each(['en', 'hi'])('A4 PDF of at most 3 pages (%s)', async (lang) => {
    const img = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#6a4' } }).jpeg().toBuffer();
    const c = buildReport(input({ lang }));
    const pdf = await renderReport(c, { photo: img, gradcam: img, map: img }, contentHash(c));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(pages(pdf)).toBeLessThanOrEqual(3);
  });
});

describe('report API', () => {
  let mongod;
  const GUEST_ID = '000000000000000000000000';
  const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
  let jpeg;
  let png;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
    jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#5a3' } }).jpeg().toBuffer();
    png = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#eee' } }).png().toBuffer();
  });
  afterEach(async () => {
    nock.cleanAll();
    await Promise.all([Prediction, Report, FieldHealthCache, WeatherCache].map((m) => m.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    nock.enableNetConnect();
  });

  const base = { userId: GUEST_ID, deviceId: DEVICE, crop: 'rice', status: 'ok', disease: 'Blast', confidence: 0.93,
    severity: 'moderate', yieldLossPercent: 25, treatment: 't', imageUrl: 'http://img.test/photo.jpg', gradcam: 'http://img.test/cam.png',
    modelVersion: { backbone: 'b1', head: 'rice-h1', gate: 'g1' } };
  const loc = parseLocation({ lat: '30.9123', lon: '75.8067', location_source: 'gps' });
  const images = () => nock('http://img.test').get('/photo.jpg').reply(200, jpeg).get('/cam.png').reply(200, png);
  const tiles = () => nock('http://tiles.test').matchHeader('user-agent', /PlantGuard/).get(/\/13\/\d+\/\d+\.png/).times(12).reply(200, png);
  const get = (id, device = DEVICE, query = {}) =>
    request(app).get(`/api/predict/${id}/report.pdf`).query(query).set('x-device-id', device).buffer(true)
      .parse((res, cb) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); });

  test('a PDF for the owner; its record and the public verify answer carry the hashes and no private data', async () => {
    const p = await Prediction.create({ ...base, ...loc });
    const img = images();
    const osm = tiles();
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503); // weather down: the report still comes
    const r = await get(p._id);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="plantguard-report-PG-[\w-]{12}\.pdf"/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(img.isDone()).toBe(true);
    expect(osm.isDone()).toBe(false); // .times(12) is an upper bound; at least one tile was asked for
    expect(nock.pendingMocks().filter((m) => m.includes('tiles.test')).length).toBeLessThan(12);

    const rec = await Report.findOne({ predictionId: p._id }).lean();
    expect(rec.pdfSha256).toBe(createHash('sha256').update(r.body).digest('hex'));
    expect(rec.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    const v = await request(app).get(`/api/reports/${rec.reportId}`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ reportId: rec.reportId, lang: 'en', pdfSha256: rec.pdfSha256, contentSha256: rec.contentSha256,
      summary: { crop: 'rice', disease: 'Blast', confidence: 0.93, severity: 'moderate', yieldLossPercent: 25, yieldLossConfidence: 'high' } });
    expect(JSON.stringify(v.body)).not.toMatch(/30\.91|75\.80|deviceId|imageUrl|location/);
    expect((await request(app).get('/api/reports/PG-doesnotexist')).status).toBe(404);
  });

  test('language from ?lang=hi; a missing photo, map and field check leave gaps, not a failed report', async () => {
    const p = await Prediction.create({ ...base, ...loc });
    nock('http://img.test').get('/photo.jpg').reply(404).get('/cam.png').reply(500);
    nock('http://tiles.test').get(/.*/).times(12).reply(503);
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    const r = await get(p._id, DEVICE, { lang: 'hi' });
    expect(r.status).toBe(200);
    expect((await Report.findOne({ predictionId: p._id })).lang).toBe('hi');
  });

  test('uses a cached field-health answer and never calls the geo-service', async () => {
    const p = await Prediction.create({ ...base, ...loc });
    await FieldHealthCache.create({ key: keyForPrediction(p), result: fieldHealth });
    images();
    tiles();
    nock('http://meteo.test').get('/v1/forecast').query(true).reply(503);
    process.env.GEO_SERVICE_URL = 'http://geo.test'; // any call there would fail: no interceptor, no network
    try {
      expect((await get(p._id)).status).toBe(200);
    } finally {
      delete process.env.GEO_SERVICE_URL;
    }
  });

  test('without a location: no map, weather or satellite calls at all', async () => {
    const p = await Prediction.create({ ...base, crop: 'wheat', disease: 'LeafBlight' });
    images();
    expect((await get(p._id)).status).toBe(200);
  });

  test('not yours / bad id -> 404; a rejected photo -> 409', async () => {
    const p = await Prediction.create(base);
    const rejected = await Prediction.create({ ...base, status: 'rejected_quality', disease: undefined, confidence: undefined,
      severity: undefined, treatment: undefined });
    expect((await get(p._id, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).status).toBe(404);
    expect((await get('nope')).status).toBe(404);
    expect((await get(rejected._id)).status).toBe(409);
    expect(await Report.countDocuments()).toBe(0);
  });

  test('"Delete my data" withdraws the reports: the verify link answers 404', async () => {
    const p = await Prediction.create(base);
    images();
    await get(p._id);
    const { reportId } = await Report.findOne().lean();
    nock('https://api.cloudinary.com').post(/.*/).times(2).reply(200, { result: 'not found' });
    expect((await request(app).delete('/api/predict').set('x-device-id', DEVICE)).status).toBe(200);
    expect((await request(app).get(`/api/reports/${reportId}`)).status).toBe(404);
  });
});
