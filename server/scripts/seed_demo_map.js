// FAKE data for a local map demo: made-up diagnoses scattered around real farming districts.
//   cd server
//   MONGODB_URI=mongodb://127.0.0.1:27017/plantdisease node scripts/seed_demo_map.js          # add
//   MONGODB_URI=mongodb://127.0.0.1:27017/plantdisease node scripts/seed_demo_map.js --clear  # remove
// Every record has demo: true and a placeholder image. It refuses any database that isn't on this
// machine, and the map API only shows demo records when MAP_INCLUDE_DEMO=true on a non-production
// server (controllers/mapController.js), so demo points can never mix with the live map.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { parseLocation } from '../utils/geo.js';
import { GUEST_ID } from '../middleware/guestDevice.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const isLocalMongo = (uri) => {
  try {
    const url = new URL(uri);
    return url.protocol === 'mongodb:' && url.hostname.split(',').every((h) => LOCAL_HOSTS.has(h));
  } catch {
    return false;
  }
};

// district centre, spread (km), crop and the diseases reported there; devices = fake farmers
const REGIONS = [
  { name: 'Ludhiana', lat: 30.90, lon: 75.85, km: 12, crop: 'wheat', diseases: ['LeafBlight', 'BlackPoint'], devices: 14 },
  { name: 'Murshidabad', lat: 24.18, lon: 88.27, km: 10, crop: 'wheat', diseases: ['WheatBlast'], devices: 6 },
  { name: 'Muzaffarnagar', lat: 29.47, lon: 77.70, km: 12, crop: 'sugarcane', diseases: ['smut', 'BrownRust', 'Pokkah_Boeng'], devices: 12 },
  { name: 'Kolhapur', lat: 16.70, lon: 74.24, km: 10, crop: 'sugarcane', diseases: ['Grassy_shoot', 'Brown_Spot'], devices: 8 },
  { name: 'Cuttack', lat: 20.46, lon: 85.88, km: 12, crop: 'rice', diseases: ['Blast', 'Bacterialblight'], devices: 12 },
  { name: 'Thanjavur', lat: 10.79, lon: 79.14, km: 12, crop: 'rice', diseases: ['Brownspot', 'Tungro'], devices: 10 },
  { name: 'Hooghly', lat: 22.90, lon: 88.39, km: 8, crop: 'potato', diseases: ['Late_blight'], devices: 10 },
  { name: 'Agra', lat: 27.18, lon: 78.01, km: 10, crop: 'potato', diseases: ['Early_blight', 'Late_blight'], devices: 8 },
  { name: 'Davanagere', lat: 14.46, lon: 75.92, km: 10, crop: 'maize', diseases: ['Common_Rust', 'Blight'], devices: 8 },
  { name: 'Kalaburagi', lat: 17.33, lon: 76.83, km: 12, crop: 'pigeonpea', diseases: ['Sterilic_mosaic', 'Leaf_Spot'], devices: 8 },
  { name: 'Anantapur', lat: 14.68, lon: 77.60, km: 12, crop: 'groundnut', diseases: ['Leaf_Spot', 'Rust'], devices: 10 },
  { name: 'Vidisha', lat: 23.52, lon: 77.81, km: 10, crop: 'blackgram', diseases: ['Yellow_Mosaic'], devices: 8 },
  { name: 'Shopian', lat: 33.72, lon: 74.83, km: 6, crop: 'apple', diseases: ['Alternaria_Leaf_Blotch'], devices: 6 },
  { name: 'Jalgaon', lat: 21.01, lon: 75.56, km: 10, crop: 'banana', diseases: ['Panama_Wilt', 'Sigatoka_Leaf_Spot'], devices: 10 },
  { name: 'Tiruchirappalli', lat: 10.80, lon: 78.69, km: 8, crop: 'banana', diseases: ['Bract_Mosaic_Virus'], devices: 6 },
];
const SEVERITIES = ['early', 'moderate', 'severe'];

// small seeded generator, so every run makes the same demo
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoPredictions(now = new Date(), seed = 26) {
  const rand = rng(seed);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const docs = [];
  for (const r of REGIONS) {
    for (let d = 0; d < r.devices; d++) {
      const deviceId = randomUUID();
      // each fake farmer has a home field and reports 1-3 leaves near it; fields cluster near the centre
      const dist = r.km * Math.sqrt(rand()) * (rand() < 0.6 ? 0.25 : 1);
      const angle = rand() * 2 * Math.PI;
      const home = { lat: r.lat + (dist / 111) * Math.sin(angle), lon: r.lon + (dist / (111 * Math.cos(r.lat * Math.PI / 180))) * Math.cos(angle) };
      for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
        const place = parseLocation({ lat: String(home.lat + (rand() - 0.5) * 0.004), lon: String(home.lon + (rand() - 0.5) * 0.004),
          accuracy_m: String(Math.round(10 + rand() * 40)), location_source: 'gps' });
        docs.push({
          userId: GUEST_ID, deviceId, demo: true, ...place,
          crop: r.crop, status: 'ok', disease: pick(r.diseases), confidence: Number((0.72 + rand() * 0.27).toFixed(3)),
          severity: pick(SEVERITIES), treatment: 'DEMO DATA - not a real diagnosis', yieldLossPercent: null,
          imageUrl: 'https://example.invalid/demo-seed.jpg', reasons: [],
          createdAt: new Date(now.getTime() - Math.floor(rand() * 85) * 86_400_000 - Math.floor(rand() * 86_400_000)),
        });
      }
    }
  }
  return docs;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uri = process.env.MONGODB_URI ?? '';
  if (!isLocalMongo(uri) || process.env.NODE_ENV === 'production') {
    console.error('Refusing: demo data may only go into a MongoDB on this machine (mongodb://localhost or 127.0.0.1).');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('predictions');
  if (process.argv.includes('--clear')) {
    const { deletedCount } = await col.deleteMany({ demo: true });
    console.log(`removed ${deletedCount} demo records`);
  } else {
    const docs = demoPredictions();
    await col.insertMany(docs.map((d) => ({ ...d, updatedAt: d.createdAt })));
    console.log(`inserted ${docs.length} DEMO records (demo: true) from ${REGIONS.length} districts;`,
      'start the server with MAP_INCLUDE_DEMO=true to see them on the map');
  }
  await mongoose.disconnect();
}
