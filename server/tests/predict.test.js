import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import sharp from 'sharp';
import app from '../app.js';
import Prediction from '../models/Prediction.js';
import logger from '../utils/logger.js';

const GUEST_ID = '000000000000000000000000'; // guest-auth bypass in middleware/auth.js (login disabled)
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER_DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const image = (width, height, format = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: '#3a7d2c' } }).toFormat(format).toBuffer();
let JPEG;
const UPLOADED_URL = 'https://res.cloudinary.com/test-cloud/image/upload/v1/plant-disease/leaf.jpg';
const GRADCAM_URL = 'https://res.cloudinary.com/test-cloud/image/upload/v1/plant-disease/gradcam/cam.png';

let mongod;

beforeAll(async () => {
  JPEG = await image(64, 64);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/); // supertest's own server only
});

afterEach(async () => {
  nock.cleanAll();
  cloudUploads.length = 0;
  await Prediction.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  nock.enableNetConnect();
});

// answers both uploads of a prediction: the photo, and the Grad-CAM heatmap (folder plant-disease/gradcam)
const cloudUploads = [];
const mockCloudinary = () =>
  nock('https://api.cloudinary.com')
    .post(/\/v1_1\/test-cloud\/image\/upload/)
    .times(2)
    .reply(200, (uri, body) => {
      const text = /^[0-9a-f]+$/i.test(body) ? Buffer.from(body, 'hex').toString('latin1') : String(body); // nock hex-encodes binary bodies
      const heatmap = text.includes('plant-disease/gradcam');
      cloudUploads.push(heatmap ? 'gradcam' : 'photo');
      return { secure_url: heatmap ? GRADCAM_URL : UPLOADED_URL };
    });

// the ML service only answers calls that carry the shared secret
const mockML = (status, body) =>
  nock('http://ml.test').matchHeader('x-ml-token', 'test-ml-token').post('/predict-disease').reply(status, body);

const upload = (crop = 'blackgram', file = JPEG, filename = 'leaf.jpg', contentType = 'image/jpeg') => {
  const req = request(app).post('/api/predict').set('x-device-id', DEVICE);
  if (crop) req.field('crop', crop);
  if (file) req.attach('image', file, { filename, contentType });
  return req;
};

const ML_OK = {
  status: 'ok', reasons: [], ood_score: 0.12,
  quality: { short_side: 512, blur: 900, brightness: 120, vegetation: 0.9 },
  disease: 'Yellow_Mosaic', confidence: 0.98, severity: 'moderate', gradcam: 'iVBORw0KGgo=', crop: 'blackgram',
  model_version: { backbone: '1.0.0', head: '1.0.0', gate: '1.0.0' },
};

describe('POST /api/predict', () => {
  test('missing file -> 400', async () => {
    const res = await upload('blackgram', null);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'No image uploaded' });
  });

  test('missing crop -> 400', async () => {
    const res = await upload(null);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Crop type is required' });
  });

  test('non-image upload is rejected by the upload filter -> 400', async () => {
    const res = await upload('blackgram', Buffer.from('hello'), 'notes.txt', 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only image files are allowed');
  });

  test('happy path: saves a Prediction with treatment and yield loss; the heatmap goes to Cloudinary', async () => {
    const ml = mockML(200, ML_OK);
    const cloud = mockCloudinary();
    const res = await upload();
    expect(res.status).toBe(201);
    expect(ml.isDone() && cloud.isDone()).toBe(true);
    expect(cloudUploads.sort()).toEqual(['gradcam', 'photo']);
    expect(res.body.gradcam).toBe(GRADCAM_URL); // a URL, not ~100 KB of base64 in MongoDB
    expect(res.body).toMatchObject({
      crop: 'blackgram', status: 'ok', disease: 'Yellow_Mosaic', severity: 'moderate',
      imageUrl: UPLOADED_URL, userId: GUEST_ID, yieldLossPercent: 50,
    });
    expect(res.body.treatment).toMatch(/whitefly/i);
    const saved = await Prediction.findById(res.body._id).lean();
    expect(saved).toMatchObject({ status: 'ok', disease: 'Yellow_Mosaic', oodScore: 0.12,
      modelVersion: { backbone: '1.0.0', head: '1.0.0', gate: '1.0.0' } });
    expect(res.body.modelVersion).toEqual({ backbone: '1.0.0', head: '1.0.0', gate: '1.0.0' });
  });

  test('uncertain result is saved without treatment or yield loss', async () => {
    mockML(200, { ...ML_OK, status: 'uncertain', reasons: ['unfamiliar_image'], ood_score: 3.2,
      top3: [{ disease: 'Yellow_Mosaic', probability: 0.5 }, { disease: 'Healthy', probability: 0.3 },
        { disease: 'Anthracnose', probability: 0.2 }] });
    mockCloudinary();
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'uncertain', reasons: ['unfamiliar_image'], treatment: null, yieldLossPercent: null });
    expect(res.body.top3).toHaveLength(3);
  });

  test('rejected photo is saved with its reasons and no diagnosis', async () => {
    mockML(200, { status: 'rejected_quality', reasons: ['blurry'], ood_score: null,
      quality: { short_side: 512, blur: 2, brightness: 120, vegetation: 0.9 }, crop: 'blackgram' });
    mockCloudinary();
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'rejected_quality', reasons: ['blurry'], treatment: null });
    expect(res.body.disease).toBeUndefined();
  });

  test('ML service error -> 502 with a safe message, nothing uploaded or saved', async () => {
    mockML(500, { detail: 'Traceback (most recent call last): secret internals' });
    const cloud = mockCloudinary();
    const res = await upload();
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'The diagnosis service is unavailable right now. Please try again shortly.' });
    expect(JSON.stringify(res.body)).not.toMatch(/Traceback|secret/);
    expect(cloud.isDone()).toBe(false);
    expect(await Prediction.countDocuments()).toBe(0);
  });

  test('the request id follows the call to the ML service and back; the log has no image or device', async () => {
    const info = jest.spyOn(logger, 'info');
    const ml = nock('http://ml.test').matchHeader('x-request-id', 'req-abc').post('/predict-disease').reply(200, ML_OK);
    mockCloudinary();
    const res = await upload().set('x-request-id', 'req-abc');
    expect(ml.isDone()).toBe(true);
    expect(res.headers['x-request-id']).toBe('req-abc');
    const [entry] = info.mock.calls.find(([, msg]) => msg === 'prediction');
    expect(entry).toMatchObject({ requestId: 'req-abc', crop: 'blackgram', status: 'ok', disease: 'Yellow_Mosaic',
      confidence: 0.98, modelVersion: { head: '1.0.0' } });
    expect(entry.mlLatencyMs).toBeGreaterThanOrEqual(0);
    expect(entry).toMatchObject({ diseaseSeverity: 'moderate' });
    expect(entry).not.toHaveProperty('severity'); // Cloud Logging reads "severity" as the log level
    expect(JSON.stringify(entry)).not.toMatch(/cloudinary|iVBOR|3f2b8c1e/);
    info.mockRestore();
  });

  test('a malformed incoming request id is replaced by a fresh one', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'bad id with spaces');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('a cold-start 503 from the ML service is retried once', async () => {
    const first = mockML(503, 'Service Unavailable');
    const second = mockML(200, ML_OK);
    mockCloudinary();
    const res = await upload();
    expect(first.isDone() && second.isDone()).toBe(true);
    expect(res.status).toBe(201);
  });

  test('a second failure is not retried again -> 502', async () => {
    mockML(503, 'x');
    mockML(503, 'x');
    const third = mockML(200, ML_OK);
    const res = await upload();
    expect(res.status).toBe(502);
    expect(third.isDone()).toBe(false);
  });

  test('ML service unreachable -> 502', async () => {
    // a closed local port gives a real ECONNREFUSED without leaving the machine
    const saved = process.env.FASTAPI_URL;
    process.env.FASTAPI_URL = 'http://127.0.0.1:9';
    try {
      const res = await upload();
      expect(res.status).toBe(502);
    } finally {
      process.env.FASTAPI_URL = saved;
    }
  });

  test('ML service says the file is not an image -> 400', async () => {
    mockML(415, { detail: 'file is not a readable image' });
    const res = await upload();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'The uploaded file is not a readable image' });
  });
});

describe('upload validation (real bytes, not the claimed mimetype)', () => {
  test.each([
    ['text disguised as a JPEG', () => Buffer.from('definitely not a photo'), 'Only JPEG, PNG or WebP images are allowed'],
    ['GIF disguised as a JPEG', () => image(32, 32, 'gif'), 'Only JPEG, PNG or WebP images are allowed'],
    ['image wider than 4000 px', () => image(4001, 8, 'png'), 'Image is too large (max 4000 px per side)'],
  ])('%s -> 400, ML service never called', async (_, make, message) => {
    const ml = mockML(200, ML_OK);
    const res = await upload('blackgram', await make());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
    expect(ml.isDone()).toBe(false);
  });

  test('PNG and WebP are accepted', async () => {
    for (const format of ['png', 'webp']) {
      mockML(200, ML_OK);
      mockCloudinary();
      expect((await upload('blackgram', await image(64, 64, format), `leaf.${format}`)).status).toBe(201);
    }
  });

  test('the stored copy is at most 1280 px on its long side', async () => {
    const { cleanImage } = await import('../utils/image.js');
    const meta = await sharp(await cleanImage(await image(3000, 2000))).metadata();
    expect([meta.width, meta.height]).toEqual([1280, 853]);
  });

  test('the stored copy has no EXIF metadata (GPS, camera) and keeps a small size', async () => {
    const { cleanImage } = await import('../utils/image.js');
    const withExif = await sharp(await image(64, 48)).withExif({ IFD0: { Artist: 'farmer', Make: 'PhoneCo' } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const meta = await sharp(await cleanImage(withExif)).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 64, 48]);
  });
});

describe('GET /api/predict (history)', () => {
  const base = { imageUrl: UPLOADED_URL, crop: 'rice', disease: 'Blast', confidence: 0.9, severity: 'early', treatment: 't' };

  test("a guest sees only this browser's records, newest first; old records read as status ok", async () => {
    await Prediction.create({ ...base, userId: GUEST_ID, deviceId: DEVICE, createdAt: new Date('2026-01-01') });
    await Prediction.create({ ...base, userId: GUEST_ID, deviceId: DEVICE, crop: 'wheat', createdAt: new Date('2026-02-01') });
    await Prediction.create({ ...base, userId: GUEST_ID, deviceId: OTHER_DEVICE, crop: 'potato' }); // another guest
    await Prediction.create({ ...base, userId: GUEST_ID, crop: 'maize' }); // guest record from before device ids
    await Prediction.create({ ...base, userId: '111111111111111111111111', crop: 'apple' }); // a signed-in user's
    // a record saved before the OOD gate and model versioning existed has neither field
    await Prediction.collection.insertOne({ ...base, userId: new mongoose.Types.ObjectId(GUEST_ID), deviceId: DEVICE,
      crop: 'sugarcane', createdAt: new Date('2025-12-01') });

    const res = await request(app).get('/api/predict').set('x-device-id', DEVICE.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.crop)).toEqual(['wheat', 'rice', 'sugarcane']);
    expect(res.body.every((p) => p.status === 'ok')).toBe(true);
    expect(res.body[2].modelVersion).toBeNull();
  });

  test('history leaves out the heatmap and pages by 50 with ?before=', async () => {
    const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000);
    await Prediction.insertMany(Array.from({ length: 55 }, (_, i) =>
      ({ ...base, userId: GUEST_ID, deviceId: DEVICE, gradcam: 'A'.repeat(1000), createdAt: day(i) })));
    const page1 = (await request(app).get('/api/predict').set('x-device-id', DEVICE)).body;
    expect(page1).toHaveLength(50);
    expect(page1[0].gradcam).toBeUndefined();
    const page2 = (await request(app).get('/api/predict').query({ before: page1[49].createdAt }).set('x-device-id', DEVICE)).body;
    expect(page2).toHaveLength(5);
    expect(new Date(page2[0].createdAt) < new Date(page1[49].createdAt)).toBe(true);
    const bad = await request(app).get('/api/predict').query({ before: 'yesterday-ish' }).set('x-device-id', DEVICE);
    expect(bad.status).toBe(400);
  });

  test("a guest without a device id gets an empty history, never everyone's", async () => {
    await Prediction.create({ ...base, userId: GUEST_ID, deviceId: DEVICE });
    await Prediction.create({ ...base, userId: GUEST_ID });
    const res = await request(app).get('/api/predict');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('a malformed device id -> 400', async () => {
    const res = await request(app).get('/api/predict').set('x-device-id', '{ "$ne": null }');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid device id' });
  });

  test('a new prediction is saved under the device id and shows up in that history only', async () => {
    mockML(200, ML_OK);
    mockCloudinary();
    const created = await upload();
    expect(created.status).toBe(201);
    expect((await Prediction.findById(created.body._id).lean()).deviceId).toBe(DEVICE);
    expect((await request(app).get('/api/predict').set('x-device-id', DEVICE)).body).toHaveLength(1);
    expect((await request(app).get('/api/predict').set('x-device-id', OTHER_DEVICE)).body).toHaveLength(0);
  });
});
