// =====================================================================
//  TMBO service worker: offline support + push notifications.
//  Bump CACHE when you change app files so phones pick up the update.
// =====================================================================
const CACHE = 'tmbo-v1.0.0';
const SHELL = [
  './', './index.html', './css/styles.css', './js/app.js', './js/cloud.js', './js/config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './icons/favicon-32.png', './icons/badge-72.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache Supabase API calls: always go to the network.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // The Supabase library from the CDN: serve from cache, refresh in the background.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages: network first (so updates show up), fall back to the cached app when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // App files: network first, cache fallback.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});

// ---------- Push notifications (sent by the send-reminders Edge Function) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TMBO', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    tag: d.tag,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin)) { await w.focus(); try { await w.navigate(target); } catch { /* ignore */ } return; }
    }
    await self.clients.openWindow(target);
  })());
});
