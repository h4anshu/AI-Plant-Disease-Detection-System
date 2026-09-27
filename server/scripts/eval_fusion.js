// Offline check (docs/CONTEXT_LAYER.md "Fusion"): top-1 accuracy with and without re-ranking the top-3 of
// uncertain checkups by environment fit, per crop, on labelled checkups that have a context snapshot.
//   cd server && node scripts/eval_fusion.js [--alpha 0.3]
// A label is the user's feedback: "correct" (the diagnosis) or "incorrect" with a corrected class (not "Other").
// Guest feedback is unverified; the expert-labelled field set (pending item P1) replaces it when it exists.
// Below MIN_RECORDS labelled checkups it prints "insufficient data" and exits 0: no conclusion from a handful.
import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import PredictionModel from '../models/Prediction.js';
import { contextFit } from '../utils/environmentFit.js';
import { DEFAULT_ALPHA, rerank } from '../utils/fusion.js';

export const MIN_RECORDS = 200;

export const labelOf = (p) => (p.feedback === 'correct' ? p.disease
  : p.feedback === 'incorrect' && p.correctedLabel && p.correctedLabel !== 'Other' ? p.correctedLabel : null);

// records: predictions with context, top3, status, feedback -> { n, byCrop: {crop: {n, uncertain, before, after}}, overall }
export function evaluate(records, alpha = DEFAULT_ALPHA) {
  const byCrop = {};
  for (const p of records) {
    const label = labelOf(p);
    if (!label || !p.context || !['ok', 'uncertain'].includes(p.status)) continue;
    const c = (byCrop[p.crop] ??= { n: 0, uncertain: 0, before: 0, after: 0 });
    const fit = contextFit(p, p.context, p.soilTest);
    const scores = Object.fromEntries([fit.diagnosed, ...fit.alternatives].filter(Boolean).map((f) => [f.class, f.score]));
    const before = p.disease;
    const after = p.status === 'uncertain' && p.top3?.length ? rerank(p, scores, alpha)[0].disease : p.disease;
    c.n++;
    c.uncertain += p.status === 'uncertain';
    c.before += before === label;
    c.after += after === label;
  }
  const n = Object.values(byCrop).reduce((s, c) => s + c.n, 0);
  const sum = (k) => Object.values(byCrop).reduce((s, c) => s + c[k], 0);
  return { n, byCrop, overall: { n, before: sum('before'), after: sum('after') } };
}

export function report(result, alpha) {
  if (result.n < MIN_RECORDS) return `insufficient data: ${result.n} labelled checkups with a context snapshot (need ${MIN_RECORDS})`;
  const pct = (x, n) => `${((100 * x) / n).toFixed(1)}%`;
  const lines = [`alpha ${alpha}, ${result.n} labelled checkups`, 'crop        n   uncertain  top-1 without  top-1 with fusion'];
  for (const [crop, c] of Object.entries(result.byCrop).sort()) {
    lines.push(`${crop.padEnd(10)} ${String(c.n).padStart(3)}  ${String(c.uncertain).padStart(9)}  ${pct(c.before, c.n).padStart(13)}  ${pct(c.after, c.n).padStart(17)}`);
  }
  const o = result.overall;
  lines.push(`${'all'.padEnd(10)} ${String(o.n).padStart(3)}  ${''.padStart(9)}  ${pct(o.before, o.n).padStart(13)}  ${pct(o.after, o.n).padStart(17)}`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--alpha');
  const alpha = i > 0 ? Number(process.argv[i + 1]) : DEFAULT_ALPHA;
  await mongoose.connect(process.env.MONGODB_URI);
  const records = await PredictionModel.find({ demo: { $ne: true }, context: { $exists: true },
    feedback: { $in: ['correct', 'incorrect'] } }).select('crop status disease top3 feedback correctedLabel context soilTest').lean();
  console.log(report(evaluate(records, alpha), alpha));
  await mongoose.disconnect();
}
