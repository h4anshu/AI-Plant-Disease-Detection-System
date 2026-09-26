import { beforeAll, expect, test } from '@jest/globals';
import request from 'supertest';

const CLIENT = 'https://app.example';
let app;

beforeAll(async () => {
  // read when the app module loads; every Jest test file gets its own fresh modules
  process.env.PREDICT_RATE_LIMIT = '3';
  process.env.CLIENT_ORIGINS = `${CLIENT}, https://other.example`;
  ({ default: app } = await import('../app.js'));
});

test('POST /api/predict: 4th request from one IP within the window -> 429; other routes unaffected', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/predict'); // no file: rejected with 400, but still counted
    expect(res.status).toBe(400);
  }
  const blocked = await request(app).post('/api/predict');
  expect(blocked.status).toBe(429);
  expect(blocked.body).toEqual({ message: 'Too many predictions from this device. Please wait a few minutes and try again.' });
  expect(blocked.headers['ratelimit-policy']).toBeDefined();
  expect((await request(app).get('/health')).status).toBe(200);
});

test('CORS grants only the configured origins', async () => {
  const allowed = await request(app).get('/health').set('Origin', CLIENT);
  expect(allowed.headers['access-control-allow-origin']).toBe(CLIENT);
  const other = await request(app).get('/health').set('Origin', 'https://evil.example');
  expect(other.headers['access-control-allow-origin']).toBeUndefined();
});

test('helmet headers are set and oversized JSON bodies are refused without details', async () => {
  const res = await request(app).get('/health');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-powered-by']).toBeUndefined();
  const big = await request(app).post('/api/auth/login').send({ email: 'x'.repeat(20_000) });
  expect(big.status).toBe(413);
  expect(big.body).toEqual({ message: 'Invalid request body' });
});
