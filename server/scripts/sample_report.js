// Makes docs/sample_report.pdf (and the Hindi one) through the real pipeline of a running server:
// a checkup with a test-set image and a public location, the satellite view, then the reports.
// The API answers used are saved next to them, so every number in the PDFs can be checked.
//
//   node scripts/sample_report.js [api base, default http://localhost:4010/api]
// Needs the server, the ML service and the geo-service running (docs/REPORT.md, "Sample report").
// Run the server with REPORT_WATERMARK set so the PDFs say they are samples.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const API = process.argv[2] || 'http://localhost:4010/api';
const docs = (f) => new URL(`../../docs/${f}`, import.meta.url);
// test-set image (ml-service/tests/golden_expected.json) and cropland next to Punjab Agricultural
// University, Ludhiana (Earth Engine WorldCover: 95% cropland), not a farmer's field
const IMAGE = new URL('../../ml-service/tests/fixtures/golden/rice.jpg', import.meta.url);
const PLACE = { lat: '30.8990', lon: '75.7960', accuracy_m: '8', location_source: 'gps' };
const headers = { 'x-device-id': randomUUID(), 'x-request-id': randomUUID() };

const call = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res;
};

const form = new FormData();
form.append('image', new Blob([readFileSync(IMAGE)], { type: 'image/jpeg' }), 'rice.jpg');
form.append('crop', 'rice');
for (const [k, v] of Object.entries(PLACE)) form.append(k, v);
const prediction = await (await call('/predict', { method: 'POST', body: form })).json();
console.log('checkup', prediction._id, prediction.disease, prediction.confidence);

const fieldHealth = await (await call(`/predict/${prediction._id}/field-health`)).json();
console.log('field health', fieldHealth.flag?.code, `${fieldHealth.clear_images}/${fieldHealth.images}`);
const risk = await (await call(`/predict/${prediction._id}/disease-risk`)).json();

const out = { prediction, fieldHealth, risk, reports: {} };
for (const [lang, file] of [['en', 'sample_report.pdf'], ['hi', 'sample_report_hi.pdf']]) {
  const res = await call(`/predict/${prediction._id}/report.pdf?lang=${lang}`);
  const pdf = Buffer.from(await res.arrayBuffer());
  writeFileSync(docs(file), pdf);
  const reportId = res.headers.get('content-disposition').match(/plantguard-report-(PG-[\w-]+)\.pdf/)[1];
  out.reports[lang] = { file, verify: await (await call(`/reports/${reportId}`)).json() };
  console.log('wrote', file, pdf.length, 'bytes, report', reportId);
}
writeFileSync(docs('sample_report_api.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote sample_report_api.json');
