// Load test of GET /api/fields/alerts (docs/FIELD_ALERTS.md, "Operations"): the real app on an in-memory MongoDB, with the weather, flood and
// fire services replaced by a local fake that answers after a short delay, and N saved fields across N/3 browsers.
//   cd server && npm run alerts-load -- --fields 1000 --concurrency 20 --requests 600 [--clustered] [--delay 40]
// It measures our own code and database under load, and counts the calls we would make to the free services (the limits are in
// services/usage.js). It does not measure the real services: their speed and their 429s are not simulated.
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const FIELDS = Number(arg('fields', 1000));
const CONCURRENCY = Number(arg('concurrency', 20));
const REQUESTS = Number(arg('requests', 600));
const DELAY = Number(arg('delay', 40));
const CLUSTERED = process.argv.includes('--clustered');
const PORT = 4777;
const FAKE = 4778;

const pad = (n) => String(n).padStart(2, '0');
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const today = () => new Date(Date.now() + 19800e3).toISOString().slice(0, 10);

const hits = {};
const forecast = () => {
  const d0 = today();
  const time = [];
  for (let i = -14; i <= 4; i++) for (let h = 0; h < 24; h++) time.push(`${addDays(d0, i)}T${pad(h)}:00`);
  return JSON.stringify({ utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', hourly: { time, temperature_2m: time.map((t) => (Number(t.slice(11, 13)) < 6 ? 9 : 24)),
    relative_humidity_2m: time.map(() => 60), precipitation: time.map((t) => (t.slice(11, 13) === '03' ? 3 : 0)) } });
};
const daily = (from, days, base) => ({ daily: { time: Array.from({ length: days }, (_, i) => addDays(from, i)), river_discharge: Array.from({ length: days }, (_, i) => base + (i % 7)) } });
const climate = JSON.stringify(daily('2005-01-01', 6420, 90));

const fake = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const kind = url.pathname.startsWith('/api/area') ? 'firms' : url.pathname === '/v1/flood' ? (url.searchParams.get('start_date') ? 'flood-climate' : 'flood-forecast') : 'open-meteo';
  hits[kind] = (hits[kind] ?? 0) + 1;
  setTimeout(() => {
    if (kind === 'firms') { res.setHeader('content-type', 'text/plain'); res.end('latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n'); return; }
    res.setHeader('content-type', 'application/json');
    if (kind === 'flood-climate') { res.end(climate); return; }
    if (kind === 'flood-forecast') { const n = url.searchParams.get('latitude').split(',').length; res.end(JSON.stringify(Array.from({ length: n }, () => daily(addDays(today(), -1), 8, 100)))); return; }
    res.end(forecast());
  }, DELAY);
});

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function run() {
  await new Promise((r) => fake.listen(FAKE, r));
  Object.assign(process.env, {
    CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'x', CLOUDINARY_API_SECRET: 'x', FASTAPI_URL: 'http://127.0.0.1:9', JWT_SECRET: 'load', ML_SERVICE_TOKEN: 'load',
    ALERTS_DISABLED_SOURCES: 'sachet,imd,cwc,news,radar', OPEN_METEO_URL: `http://127.0.0.1:${FAKE}/v1/forecast`, OPEN_METEO_FLOOD_URL: `http://127.0.0.1:${FAKE}/v1/flood`,
    FIRMS_URL: `http://127.0.0.1:${FAKE}`, FIRMS_MAP_KEY: 'load-key', ALERT_RATE_LIMIT: '1000000', FIELD_RATE_LIMIT: '1000000', GLOBAL_RATE_LIMIT: '1000000', LOG_LEVEL: 'silent', NODE_ENV: 'test',
  });
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: app } = await import('../app.js');
  const { default: Field } = await import('../models/Field.js');
  const { default: Prediction } = await import('../models/Prediction.js');
  const { latLngToCell } = await import('h3-js');
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  const GUEST = new mongoose.Types.ObjectId('000000000000000000000000');
  const CROPS = ['wheat', 'rice', 'potato', 'maize', 'sugarcane'];
  const centres = Array.from({ length: 20 }, (_, i) => [10 + ((i * 7) % 22), 70 + ((i * 11) % 25)]);   // 20 "towns" for --clustered
  const where = (i) => {
    if (CLUSTERED) { const [la, lo] = centres[i % centres.length]; return [la + (Math.random() - 0.5) * 0.3, lo + (Math.random() - 0.5) * 0.3]; }
    return [8 + Math.random() * 26, 68 + Math.random() * 28];
  };
  const devices = Array.from({ length: Math.ceil(FIELDS / 3) }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const docs = Array.from({ length: FIELDS }, (_, i) => {
    const [lat, lon] = where(i);
    return { userId: GUEST, deviceId: devices[Math.floor(i / 3)], crop: CROPS[i % CROPS.length], stage: ['sowing', 'vegetative', 'flowering'][i % 3], location: { type: 'Point', coordinates: [lon, lat] } };
  });
  await Field.insertMany(docs);
  // reports for the disease alert to chew on: 5,000 checkups spread over the same places
  await Prediction.insertMany(Array.from({ length: 5000 }, (_, i) => { const [lat, lon] = where(i); return { userId: new mongoose.Types.ObjectId(), deviceId: `r-${i % 300}`, imageUrl: 'u', crop: CROPS[i % 5], status: 'ok', disease: 'Rust', confidence: 0.9, severity: 'moderate',
    treatment: 't', yieldLossPercent: 5, geoCell: latLngToCell(lat, lon, 7), locationSource: 'gps' }; }));

  const phase = async (label) => {
    for (const k of Object.keys(hits)) hits[k] = 0;
    const lat = [];
    let errors = 0;
    let next = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < REQUESTS) {
        const device = devices[next++ % devices.length];
        const t = performance.now();
        try {
          const r = await fetch(`http://127.0.0.1:${PORT}/api/fields/alerts`, { headers: { 'x-device-id': device } });
          const body = await r.json();
          if (r.status !== 200 || !body.fields?.length) errors += 1;
        } catch { errors += 1; }
        lat.push(performance.now() - t);
      }
    }));
    const secs = (Date.now() - t0) / 1000;
    lat.sort((a, b) => a - b);
    console.log(`\n${label}: ${REQUESTS} requests (${CONCURRENCY} at a time) over ${devices.length} browsers in ${secs.toFixed(1)} s = ${(REQUESTS / secs).toFixed(1)} requests/s, errors ${errors}`);
    console.log(`  latency ms: p50 ${pct(lat, 50).toFixed(0)}  p95 ${pct(lat, 95).toFixed(0)}  p99 ${pct(lat, 99).toFixed(0)}  max ${lat.at(-1).toFixed(0)}`);
    console.log(`  calls to the fake services: ${JSON.stringify(hits)}`);
    next = 0;
  };
  console.log(`${FIELDS} fields (${CLUSTERED ? 'clustered around 20 towns' : 'spread over India, almost no shared cell'}), fake services answer after ${DELAY} ms`);
  await phase('cold (empty caches)');
  await phase('warm (same browsers again)');
  const { usageToday } = await import('../services/usage.js');
  const u = await usageToday();
  console.log(`\nusage counters today: ${u.services.map((s) => `${s.service} ${s.calls}`).join(', ')}; Open-Meteo allowance used ${u.openMeteoPct}%`);
  console.log(`memory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  server.close(); fake.close(); await mongoose.disconnect(); await mongod.stop();
}

run().catch((e) => { console.error(e); process.exit(1); });
