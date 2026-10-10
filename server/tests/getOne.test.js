import { afterAll, afterEach, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../app.js';
import Prediction from '../models/Prediction.js';

const GUEST_ID = '000000000000000000000000';
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const base = { imageUrl: 'https://res.cloudinary.com/x/leaf.jpg', crop: 'rice', disease: 'Blast', confidence: 0.96,
  severity: 'early', treatment: 't', gradcam: 'https://res.cloudinary.com/x/heat.png', userId: GUEST_ID, deviceId: DEVICE };

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterEach(() => Prediction.deleteMany({}));
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('GET /api/predict/:id returns the owner\'s checkup with its heatmap, never the exact location', async () => {
  const p = await Prediction.create({ ...base, location: { type: 'Point', coordinates: [75.85, 30.9] } });
  const res = await request(app).get(`/api/predict/${p._id}`).set('x-device-id', DEVICE);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ _id: String(p._id), crop: 'rice', disease: 'Blast', gradcam: base.gradcam });
  expect(res.body.location).toBeUndefined();
});

test('another browser, a bad id and an unknown id all get 404', async () => {
  const p = await Prediction.create(base);
  expect((await request(app).get(`/api/predict/${p._id}`).set('x-device-id', OTHER)).status).toBe(404);
  expect((await request(app).get('/api/predict/nope').set('x-device-id', DEVICE)).status).toBe(404);
  expect((await request(app).get(`/api/predict/${new mongoose.Types.ObjectId()}`).set('x-device-id', DEVICE)).status).toBe(404);
});
