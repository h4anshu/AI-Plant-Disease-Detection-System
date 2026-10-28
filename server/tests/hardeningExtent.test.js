import { beforeAll, expect, test } from '@jest/globals';
import request from 'supertest';

let app;

beforeAll(async () => {
  // read when the app module loads; every Jest test file gets its own fresh modules
  process.env.FLOOD_EXTENT_RATE_LIMIT = '2';
  process.env.ALERT_RATE_LIMIT = '1000';
  ({ default: app } = await import('../app.js'));
});

test('GET /api/fields/:id/flood-extent: the 3rd request within the window -> 429 (each uncached one is an Earth Engine call); other routes unaffected', async () => {
  const url = '/api/fields/000000000000000000000001/flood-extent';
  for (let i = 0; i < 2; i++) expect((await request(app).get(url)).status).toBe(503); // no geo-service configured here: counted, not answered
  const blocked = await request(app).get(url);
  expect(blocked.status).toBe(429);
  expect(blocked.body.message).toMatch(/satellite checks/);
  expect((await request(app).get('/api/fields')).status).toBe(200);
});
