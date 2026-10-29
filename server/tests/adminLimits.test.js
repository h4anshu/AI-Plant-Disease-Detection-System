import { beforeAll, expect, test } from '@jest/globals';
import request from 'supertest';

// guessing the operator's token is limited per IP, and only wrong attempts count: the operator is never blocked by their own page
let app;
beforeAll(async () => {
  process.env.ADMIN_RATE_LIMIT = '3';   // read when the app module loads; every Jest test file gets its own fresh modules
  ({ default: app } = await import('../app.js'));
});

test('the 4th wrong token within the window is 429, on the summary and on the older operator routes alike', async () => {
  const bad = () => request(app).get('/api/admin/summary').set('x-alerts-token', 'guess');
  for (let i = 0; i < 3; i++) expect((await bad()).status).toBe(401);
  const blocked = await bad();
  expect(blocked.status).toBe(429);
  expect(blocked.body.message).toMatch(/failed attempts/);
  expect((await request(app).get('/api/alerts/health').set('x-alerts-token', 'guess')).status).toBe(429);   // one counter for both
  expect((await request(app).get('/health')).status).toBe(200);
});
