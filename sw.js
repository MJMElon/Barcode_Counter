// Self-destruct service worker (NO reload).
//
// Earlier versions of this site registered a precaching service worker that
// kept serving a stale app shell. This replacement removes that worker: on
// activate it clears all caches and unregisters itself. It does NOT call
// clients.navigate(), so it can't cause a reload loop. Once a device picks this
// up (browsers re-check /sw.js on navigation), the old worker is gone for good
// and the site simply loads fresh from the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
    })()
  );
});
