import { beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';

// The alert limiter counts each browser (its device id) on its own, so farmers who share one mobile-network address do not lock each other
// out; calls with no usable device id are counted by address as before, and the limiters that cost an ML call or an Earth Engine run stay per address.
const A = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const B = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
let app;
let deviceKey;

beforeAll(async () => {
  process.env.ALERT_RATE_LIMIT = '2';
  process.env.PREDICT_RATE_LIMIT = '2';
  ({ default: app } = await import('../app.js'));
  ({ deviceKey } = await import('../middleware/rateLimit.js'));
});

// the operator route sits behind the same limiter and needs no database: 401 while counted, 429 when over
const get = (device) => { const r = request(app).get('/api/alerts/health'); return device ? r.set('x-device-id', device) : r; };

describe('the alert limiter', () => {
  test('two browsers on the same address each get their own allowance; the same browser shares its own', async () => {
    for (let i = 0; i < 2; i++) expect((await get(A)).status).toBe(401);
    expect((await get(A)).status).toBe(429);                 // A is used up
    for (let i = 0; i < 2; i++) expect((await get(B)).status).toBe(401);   // B is not
    expect((await get(B)).status).toBe(429);
    expect((await get(A.toUpperCase())).status).toBe(429);   // a UUID in capitals is the same browser
  });

  test('no device id, or one that is not a UUID, is counted by address (a made-up id is no way round)', async () => {
    for (let i = 0; i < 2; i++) expect((await get()).status).toBe(401);
    expect((await get()).status).toBe(429);
    expect((await get('not-a-uuid')).status).toBe(429);       // the same address key: already used up
    expect((await request(app).get('/api/alerts/health').set('x-device-id', 'x'.repeat(5000))).status).toBe(429);
  });

  test('the key of a device is its lower-cased id; anything else falls back to the address', () => {
    const req = (id, ip = '203.0.113.7') => ({ get: (h) => (h === 'x-device-id' ? id : undefined), ip });
    expect(deviceKey(req(A.toUpperCase()))).toBe(`device:${A}`);
    expect(deviceKey(req(undefined))).toBe('203.0.113.7');
    expect(deviceKey(req('nope'))).toBe('203.0.113.7');
    expect(deviceKey(req(undefined, '2001:db8::1:2:3:4'))).toMatch(/^2001:db8:/);     // an IPv6 address is cut to its network, as the library does
  });
});

describe('the limiters that cost something stay per address', () => {
  test('a prediction is counted by address however many device ids are sent', async () => {
    for (let i = 0; i < 2; i++) expect((await request(app).post('/api/predict').set('x-device-id', i ? A : B)).status).toBe(400);
    expect((await request(app).post('/api/predict').set('x-device-id', '9f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7b')).status).toBe(429);
  });
});
