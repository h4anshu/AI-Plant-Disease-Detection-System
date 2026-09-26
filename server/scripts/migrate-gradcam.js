// One-off: move Grad-CAM heatmaps stored as base64 inside MongoDB to Cloudinary and keep only the URL.
//   cd server
//   node --env-file=.env scripts/migrate-gradcam.js           # dry run: counts only, changes nothing
//   node --env-file=.env scripts/migrate-gradcam.js --apply   # upload + replace, one record at a time
// Safe to re-run: records that already hold a URL are skipped, and a record is only updated after its
// upload succeeded.
import mongoose from 'mongoose';
import { uploadBuffer } from '../config/cloudinary.js';
import PredictionModel from '../models/Prediction.js';

const apply = process.argv.includes('--apply');
const legacy = { gradcam: { $type: 'string', $not: /^https?:\/\// } };

await mongoose.connect(process.env.MONGODB_URI);
const col = PredictionModel.collection;
const [{ n = 0, bytes = 0 } = {}] = await col.aggregate([
  { $match: legacy },
  { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: { $strLenBytes: '$gradcam' } } } },
]).toArray();
console.log(`${n} records hold a base64 heatmap (${(bytes / 1e6).toFixed(1)} MB inside MongoDB)`);

if (apply) {
  let done = 0;
  for await (const doc of col.find(legacy, { projection: { gradcam: 1 } })) {
    const base64 = doc.gradcam.replace(/^data:image\/\w+;base64,/, '');
    const url = await uploadBuffer(Buffer.from(base64, 'base64'), 'plant-disease/gradcam');
    await col.updateOne({ _id: doc._id }, { $set: { gradcam: url } });
    if (++done % 25 === 0 || done === n) console.log(`migrated ${done}/${n}`);
  }
} else if (n) {
  console.log('Dry run. Re-run with --apply to migrate.');
}
await mongoose.disconnect();
