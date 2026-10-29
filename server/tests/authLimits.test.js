import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

// Password guessing and account spam are limited per IP: only FAILED sign-ins count, so a farmer who signs in correctly is never locked out.
let app;
let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // read when the app module loads; every Jest test file gets its own fresh modules
  process.env.LOGIN_RATE_LIMIT = '3';
  process.env.REGISTER_RATE_LIMIT = '2';
  ({ default: app } = await import('../app.js'));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const body = { name: 'Asha', email: 'asha@example.com', password: 'correct horse battery' };

test('registering: the 3rd account from one IP within the hour -> 429', async () => {
  expect((await request(app).post('/api/auth/register').send(body)).status).toBe(201);
  expect((await request(app).post('/api/auth/register').send({ ...body, email: 'b@example.com' })).status).toBe(201);
  const blocked = await request(app).post('/api/auth/register').send({ ...body, email: 'c@example.com' });
  expect(blocked.status).toBe(429);
  expect(blocked.body.message).toMatch(/Too many accounts/);
});

test('signing in: correct sign-ins are never counted; the 4th wrong one -> 429, and then even the right password waits', async () => {
  for (let i = 0; i < 6; i++) expect((await request(app).post('/api/auth/login').send({ email: body.email, password: body.password })).status).toBe(200);
  for (let i = 0; i < 3; i++) expect((await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong password' })).status).toBe(401);
  const blocked = await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong password' });
  expect(blocked.status).toBe(429);
  expect(blocked.body.message).toMatch(/failed sign-in attempts/);
  expect((await request(app).post('/api/auth/login').send({ email: body.email, password: body.password })).status).toBe(429);
});
