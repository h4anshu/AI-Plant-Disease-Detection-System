import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nock from 'nock';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';

const GUEST_ID = '000000000000000000000000'; // guest-auth bypass in middleware/auth.js (login disabled)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]); // bytes are not inspected here
const UPLOADED_URL = 'https://res.cloudinary.com/test-cloud/image/upload/v1/plant-disease/leaf.jpg';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  nock.disableNetConnect();
  nock.enableNetConnect(/127\.0\.0\.1|localhost/); // supertest's own server only
});

afterEach(async () => {
  nock.cleanAll();
  await Prediction.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  nock.enableNetConnect();
});

const mockCloudinary = () =>
  nock('https://api.cloudinary.com')
    .post(/\/v1_1\/test-cloud\/image\/upload/)
    .reply(200, { secure_url: UPLOADED_URL, public_id: 'plant-disease/leaf' });

const mockML = (status, body) => nock('http://ml.test').post('/predict-disease').reply(status, body);

const upload = (crop = 'blackgram', file = JPEG, filename = 'leaf.jpg', contentType = 'image/jpeg') => {
  const req = request(app).post('/api/predict');
  if (crop) req.field('crop', crop);
  if (file) req.attach('image', file, { filename, contentType });
  return req;
};

const ML_OK = {
  status: 'ok', reasons: [], ood_score: 0.12,
  quality: { short_side: 512, blur: 900, brightness: 120, vegetation: 0.9 },
  disease: 'Yellow_Mosaic', confidence: 0.98, severity: 'moderate', gradcam: 'iVBORw0KGgo=', crop: 'blackgram',
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

  test('happy path: saves a Prediction with treatment and yield loss', async () => {
    const ml = mockML(200, ML_OK);
    const cloud = mockCloudinary();
    const res = await upload();
    expect(res.status).toBe(201);
    expect(ml.isDone() && cloud.isDone()).toBe(true);
    expect(res.body).toMatchObject({
      crop: 'blackgram', status: 'ok', disease: 'Yellow_Mosaic', severity: 'moderate',
      imageUrl: UPLOADED_URL, userId: GUEST_ID, yieldLossPercent: 50,
    });
    expect(res.body.treatment).toMatch(/whitefly/i);
    const saved = await Prediction.findById(res.body._id).lean();
    expect(saved).toMatchObject({ status: 'ok', disease: 'Yellow_Mosaic', oodScore: 0.12 });
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

describe('GET /api/predict (history)', () => {
  test("returns the guest user's records, newest first, and old records read as status ok", async () => {
    const base = { imageUrl: UPLOADED_URL, crop: 'rice', disease: 'Blast', confidence: 0.9, severity: 'early', treatment: 't' };
    await Prediction.create({ ...base, userId: GUEST_ID, createdAt: new Date('2026-01-01') });
    await Prediction.create({ ...base, userId: GUEST_ID, crop: 'wheat', createdAt: new Date('2026-02-01') });
    await Prediction.create({ ...base, userId: '111111111111111111111111' }); // someone else's
    // a record saved before the OOD gate existed has no status field at all
    await Prediction.collection.insertOne({ ...base, userId: new mongoose.Types.ObjectId(GUEST_ID), crop: 'maize',
      createdAt: new Date('2025-12-01') });

    const res = await request(app).get('/api/predict');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.crop)).toEqual(['wheat', 'rice', 'maize']);
    expect(res.body.every((p) => p.status === 'ok')).toBe(true);
  });
});
