import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// public/sw.js run against a fake worker scope: it must keep the app's own files and never anything of a person (docs/OFFLINE.md)
const code = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');   // vitest runs from client/
const ORIGIN = 'https://app.example';
let listeners; let store; let fetchImpl; let skipped; let claimed; let worker; let windows = [];

const keyOf = (req) => (typeof req === 'string' ? new URL(req, ORIGIN).href : req.url);
const boot = () => {
  listeners = {}; store = new Map(); skipped = false; claimed = false;
  const caches = {
    match: async (req) => store.get(keyOf(req)),
    open: async () => ({ put: async (req, res) => { store.set(keyOf(req), res); } }),
    keys: async () => ['pg-shell-v0', 'pg-shell-v1', 'other'],
    delete: vi.fn(async () => true),
  };
  const scope = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    location: { origin: ORIGIN },
    skipWaiting: () => { skipped = true; },
    clients: { claim: async () => { claimed = true; }, matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => ({})) },
    registration: { showNotification: vi.fn(async () => {}) },
  };
  worker = scope;
  new Function('self', 'caches', 'fetch', code)(scope, caches, (...a) => fetchImpl(...a));
  return caches;
};
const response = (body, { ok = true, type = 'text/html' } = {}) => ({ ok, body, headers: { get: () => type }, clone() { return this; } });
const call = (request) => { const respondWith = vi.fn(); listeners.fetch({ request, respondWith }); return respondWith; };
const get = (url, mode = 'cors') => ({ method: 'GET', mode, url });
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { fetchImpl = vi.fn(async () => response('net')); boot(); });

describe('install and activate', () => {
  test('takes over at once and deletes only the old shell caches', async () => {
    const caches = boot();
    listeners.install();
    expect(skipped).toBe(true);
    let wait;
    listeners.activate({ waitUntil: (p) => { wait = p; } });
    await wait;
    expect(caches.delete.mock.calls.map((c) => c[0]).sort()).toEqual(['other', 'pg-shell-v0']);
    expect(claimed).toBe(true);
  });
});

describe('what it never touches', () => {
  test.each([
    ['a POST', { method: 'POST', mode: 'cors', url: `${ORIGIN}/api/predict` }],
    ['an API read of another origin (the server)', get('https://server.example/api/fields/alerts')],
    ['an API-like path of this origin', get(`${ORIGIN}/api/fields/alerts`)],
    ['a photo', get('https://res.cloudinary.com/x/image/upload/v1/leaf.jpg')],
    ['a map tile', get('https://tile.openstreetmap.org/5/1/1.png')],
    ['a file of the public folder', get(`${ORIGIN}/samples/plantguard-sample-report.pdf`)],
  ])('%s: no answer from the worker, so the browser does it as usual', (_, request) => {
    expect(call(request)).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });
});

describe('pages', () => {
  test('online: the network answer, and the shell is saved from it', async () => {
    const res = await call(get(`${ORIGIN}/overview`, 'navigate')).mock.calls[0][0];
    expect(res.body).toBe('net');
    await settle();
    expect(store.get(`${ORIGIN}/`).body).toBe('net');
  });

  test('offline: the saved shell opens any route', async () => {
    store.set(`${ORIGIN}/`, response('saved shell'));
    fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const res = await call(get(`${ORIGIN}/history`, 'navigate')).mock.calls[0][0];
    expect(res.body).toBe('saved shell');
  });

  test('an error page or a non-page is not saved as the shell', async () => {
    fetchImpl = vi.fn(async () => response('boom', { ok: false }));
    await call(get(`${ORIGIN}/x`, 'navigate')).mock.calls[0][0];
    fetchImpl = vi.fn(async () => response('%PDF', { type: 'application/pdf' }));
    await call(get(`${ORIGIN}/y`, 'navigate')).mock.calls[0][0];
    await settle();
    expect(store.size).toBe(0);
  });
});

describe('built files and fonts', () => {
  test('a built file is fetched once, then served from the cache', async () => {
    const url = `${ORIGIN}/assets/index-abc123.js`;
    await call(get(url, 'no-cors')).mock.calls[0][0];
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const again = await call(get(url, 'no-cors')).mock.calls[0][0];
    expect(again.body).toBe('net');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a built file that failed to load is not saved', async () => {
    fetchImpl = vi.fn(async () => response('gone', { ok: false }));
    await call(get(`${ORIGIN}/assets/missing.js`)).mock.calls[0][0];
    await settle();
    expect(store.size).toBe(0);
  });

  test('font files are kept for good; the font style sheet is served saved and refreshed', async () => {
    const file = 'https://fonts.gstatic.com/s/inter/v1/a.woff2';
    await call(get(file)).mock.calls[0][0];
    await settle();
    await call(get(file)).mock.calls[0][0];
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const css = 'https://fonts.googleapis.com/css2?family=Inter';
    store.set(css, response('old css'));
    const res = await call(get(css)).mock.calls[0][0];
    expect(res.body).toBe('old css');
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.get(css).body).toBe('net');
  });

  test('the font style sheet offline with nothing saved is a failed request (the page uses its own font), not a crash', async () => {
    fetchImpl = vi.fn(async () => { throw new TypeError('offline'); });
    expect(await call(get('https://fonts.googleapis.com/css2?family=Inter')).mock.calls[0][0]).toBeUndefined();   // no Response: the browser treats it as a failed request and uses its own font
  });
});

// ---- notifications (docs/PUSH.md) ----
const push = (payload) => { const waits = []; listeners.push({ data: { json: () => (typeof payload === 'function' ? payload() : payload) }, waitUntil: (p) => waits.push(p) }); return Promise.all(waits); };
const click = (data) => { const waits = []; const close = vi.fn(); listeners.notificationclick({ notification: { close, data }, waitUntil: (p) => waits.push(p) }); return Promise.all(waits).then(() => close); };

describe('push', () => {
  beforeEach(() => { windows = []; });

  test('draws the notification the server sent, with the app icon and a tag that replaces the same warning', async () => {
    await push({ title: 'Frost: Warning', body: 'Your wheat field, tomorrow.', tag: 'FROST|2027-02-25', url: '/overview?mode=weather' });
    expect(worker.registration.showNotification).toHaveBeenCalledWith('Frost: Warning', expect.objectContaining({
      body: 'Your wheat field, tomorrow.', tag: 'FROST|2027-02-25', icon: '/icons/icon-192.png', data: { url: '/overview?mode=weather' } }));
  });

  test('shows nothing for a message that is not ours (no title, or not JSON)', async () => {
    await push({ body: 'no title' });
    await push(() => { throw new SyntaxError('not json'); });
    listeners.push({ data: null, waitUntil: () => {} });
    expect(worker.registration.showNotification).not.toHaveBeenCalled();
  });

  test.each([['//evil.example/x'], ['https://evil.example/x'], ['javascript:alert(1)'], [undefined], [42]])('a tap opens the app, never %s', async (url) => {
    await push({ title: 't', url });
    expect(worker.registration.showNotification.mock.calls[0][1].data.url).toBe('/overview');
  });

  test('a tap closes the notification and opens the app at its page when no window is open', async () => {
    const close = await click({ url: '/overview?mode=weather' });
    expect(close).toHaveBeenCalled();
    expect(worker.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/overview?mode=weather`);
  });

  test('with the app already open, that window is brought forward and sent to the page', async () => {
    const win = { url: `${ORIGIN}/history`, focus: vi.fn(async function focus() { return this; }), navigate: vi.fn(async () => {}) };
    windows = [{ url: 'https://other.example/', focus: vi.fn() }, win];
    await click({ url: '/overview?mode=weather' });
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith(`${ORIGIN}/overview?mode=weather`);
    expect(worker.clients.openWindow).not.toHaveBeenCalled();
  });

  test('a notification with no page goes to the overview', async () => {
    await click(undefined);
    expect(worker.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/overview`);
  });
});
