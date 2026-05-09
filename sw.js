/* MJM Scan Counter — service worker for offline use.
 * Bump CACHE_VERSION when shipping a new index.html so clients pull fresh code.
 */
const CACHE_VERSION = 'v4';
const CACHE_NAME = 'mjm-scan-' + CACHE_VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Space+Grotesk:wght@400;500;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const req = new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' });
        const res = await fetch(req);
        if (res) await cache.put(url, res.clone());
      } catch (_) { /* offline first install — non-fatal */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for the document so updates land quickly when online,
  // falling back to the cached shell when offline.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match('./index.html');
        return cached || caches.match('./');
      }
    })());
    return;
  }

  // Cache-first for everything else (scripts, fonts, icons).
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
