// PlantGuard service worker (docs/OFFLINE.md): lets the app open with no signal.
// It keeps only the app's OWN files: the page shell, built scripts and styles, fonts. It never keeps an API answer: those belong to one
// person, and a cache shared by everyone who uses this phone would show the last user's alerts to the next. The app itself keeps the last
// good alerts and log per user (client/src/services/offlineCache.js).
//
// Notifications (docs/PUSH.md): the server sends { title, body, tag, url }; this draws it, and a tap opens the app at `url`. The words are
// made on the server in the phone's language; the worker only shows them. A same `tag` replaces the earlier notification of that warning.
// ponytail: files of old deploys stay in the cache until CACHE is renamed; a few MB per deploy, rename it when that matters.
const CACHE = 'pg-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('push', (event) => {
  let m = {};
  try { m = event.data?.json() ?? {}; } catch { /* not ours: show nothing rather than an empty box */ }
  if (!m.title) return;
  event.waitUntil(self.registration.showNotification(m.title, {
    body: m.body, tag: m.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: typeof m.url === 'string' && m.url.startsWith('/') && !m.url.startsWith('//') ? m.url : '/overview' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/overview', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    return open ? open.focus().then((w) => (w.navigate ? w.navigate(url) : w)) : self.clients.openWindow(url);
  }));
});

const save = (request, response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); } return response; };

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // a page: from the network when there is one (a new deploy shows at once), else the saved shell. Every page of the app is the same
  // index.html (the router draws it), so one saved copy opens any route.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((res) => (res.ok && res.headers.get('content-type')?.includes('text/html') ? save('/', res) : res)).catch(() => caches.match('/')));
    return;
  }

  // built files have a hash in their name and never change: saved on first use, then served from the cache
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => save(request, res))));
    return;
  }

  // Google Fonts: the style sheet may change, so serve the saved one and refresh it; the font files themselves never change
  if (url.origin === 'https://fonts.googleapis.com') {
    event.respondWith(caches.match(request).then((hit) => {
      const fresh = fetch(request).then((res) => save(request, res)).catch(() => hit);
      return hit || fresh;
    }));
  } else if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => save(request, res))));
  }
  // anything else (the API, map tiles, photos) is not touched
});
