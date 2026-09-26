// Per-crop daily prediction stats and a drift flag (docs/MONITORING.md).
//   cd server
//   node --env-file=.env scripts/drift_report.js                 # report for today (UTC)
//   node --env-file=.env scripts/drift_report.js --date 2026-10-01 --json
//   node scripts/drift_report.js --sample                        # made-up data in an in-memory DB
// Exit code 2 when a crop is flagged, so a scheduled job can alert on it.
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const DAY = 86_400_000;
const DIAGNOSED = ['ok', 'uncertain']; // statuses that carry a confidence
const REJECTED = ['rejected_quality', 'not_leaf'];

const dayStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const round = (x, digits = 3) => (x === null ? null : Number(x.toFixed(digits)));

// Report day = the UTC day of `date`; baseline = the `baselineDays` days before it. A crop is flagged
// when its mean confidence on the report day is more than `dropPoints` percentage points below its
// baseline. ponytail: needs >= minCount predictions on both sides, so a quiet crop never flags on noise.
export async function driftReport(collection, { date = new Date(), baselineDays = 14, dropPoints = 10, minCount = 5 } = {}) {
  const end = new Date(dayStart(date).getTime() + DAY);
  const from = new Date(end.getTime() - (baselineDays + 1) * DAY);
  const rows = await collection.aggregate([
    { $match: { createdAt: { $gte: from, $lt: end }, demo: { $ne: true } } }, // never seed_demo_map.js data
    { $set: { status: { $ifNull: ['$status', 'ok'] } } }, // records from before the gate
    { $group: {
      _id: { crop: '$crop', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
      count: { $sum: 1 },
      confSum: { $sum: { $cond: [{ $in: ['$status', DIAGNOSED] }, '$confidence', 0] } },
      confN: { $sum: { $cond: [{ $and: [{ $in: ['$status', DIAGNOSED] }, { $isNumber: '$confidence' }] }, 1, 0] } },
      uncertain: { $sum: { $cond: [{ $eq: ['$status', 'uncertain'] }, 1, 0] } },
      rejected: { $sum: { $cond: [{ $in: ['$status', REJECTED] }, 1, 0] } },
      incorrect: { $sum: { $cond: [{ $eq: ['$feedback', 'incorrect'] }, 1, 0] } },
    } },
    { $sort: { '_id.crop': 1, '_id.day': 1 } },
  ]).toArray();

  const reportDay = dayStart(date).toISOString().slice(0, 10);
  const daily = rows.map((r) => ({
    crop: r._id.crop, day: r._id.day, count: r.count,
    meanConfidence: r.confN ? round(r.confSum / r.confN) : null,
    uncertainShare: round(r.uncertain / r.count), rejectedShare: round(r.rejected / r.count),
    feedbackIncorrect: r.incorrect, confSum: r.confSum, confN: r.confN,
  }));

  const crops = [...new Set(daily.map((d) => d.crop))].map((crop) => {
    const today = daily.find((d) => d.crop === crop && d.day === reportDay);
    const base = daily.filter((d) => d.crop === crop && d.day < reportDay);
    const baseN = base.reduce((s, d) => s + d.confN, 0);
    const baseline = baseN ? base.reduce((s, d) => s + d.confSum, 0) / baseN : null;
    const current = today?.meanConfidence ?? null;
    const dropPts = current !== null && baseline !== null ? round((baseline - current) * 100, 1) : null;
    const enough = (today?.confN ?? 0) >= minCount && baseN >= minCount;
    return { crop, count: today?.count ?? 0, meanConfidence: current, baselineConfidence: round(baseline),
      dropPoints: dropPts, uncertainShare: today?.uncertainShare ?? null, rejectedShare: today?.rejectedShare ?? null,
      flagged: enough && dropPts > dropPoints };
  });
  return { reportDay, baselineDays, dropPoints, crops,
    daily: daily.map(({ confSum, confN, ...d }) => d) }; // eslint-disable-line no-unused-vars
}

// 15 days of made-up predictions: steady everywhere, except wheat confidence falls on the last day
export function sampleData(date = new Date()) {
  const docs = [];
  const last = dayStart(date).getTime();
  for (let d = 14; d >= 0; d--) {
    for (const crop of ['wheat', 'rice', 'banana']) {
      for (let i = 0; i < 8; i++) {
        const drifted = crop === 'wheat' && d === 0;
        const status = i === 7 ? 'uncertain' : i === 6 && d % 3 === 0 ? 'rejected_quality' : 'ok';
        docs.push({ crop, status, createdAt: new Date(last - d * DAY + (i + 1) * 3_600_000),
          confidence: status === 'rejected_quality' ? undefined : (drifted ? 0.72 : 0.93) - i * 0.005 });
      }
    }
  }
  return docs;
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let mem;
  if (process.argv.includes('--sample')) {
    const { MongoMemoryServer } = await import('mongodb-memory-server'); // dev dependency
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.connection.collection('predictions').insertMany(sampleData());
  } else {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const report = await driftReport(mongoose.connection.collection('predictions'), {
    date: arg('--date') ? new Date(arg('--date')) : new Date(),
    baselineDays: Number(arg('--days')) || 14,
  });
  await mongoose.disconnect();
  await mem?.stop();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.log(`Drift report for ${report.reportDay} (baseline: previous ${report.baselineDays} days)`);
    console.table(report.crops);
  }
  const flagged = report.crops.filter((c) => c.flagged).map((c) => c.crop);
  if (flagged.length) console.log(`FLAGGED: ${flagged.join(', ')} - mean confidence dropped more than ${report.dropPoints} points`);
  process.exitCode = flagged.length ? 2 : 0;
}
