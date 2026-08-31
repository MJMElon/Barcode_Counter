/* The FC Portal's offline app shell.
 *
 * HISTORY, because this file has a production incident behind it: an earlier
 * precaching worker served a STALE app shell — cache first, network never —
 * and phones kept opening a dead build long after the fix had shipped. This
 * file then spent months as a self-destruct worker whose only job was to
 * unregister that one. Offline entry is now wanted on purpose (a Field
 * Conductor loses signal for hours and must still open the portal), so a
 * worker is back — built so the old failure cannot recur:
 *
 *   - HTML is NETWORK FIRST. Anyone with signal always gets the live deploy;
 *     the cache answers only when the network itself fails. The incident was
 *     precache-first HTML; this property is the load-bearing one. Do not
 *     flip it.
 *   - Hashed assets (assets/*-<hash>.js/css) are cache first, which is safe
 *     BECAUSE of the hashes: fresh HTML can only ever name fresh files, so a
 *     cached old chunk can never be served into a new page.
 *   - Supabase is never touched — not cached, not intercepted. A stale row
 *     mistaken for the truth is worse than a failed request, and the outbox
 *     already owns "the request failed".
 *
 * The escape hatch survives: app.html's recovery code still unregisters
 * every worker and clears every cache when the app fails to mount, so a
 * misbehaving worker is two automatic reloads away from gone.
 */
const VER = 'fc-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (!url.startsWith('http')) return;
  if (url.includes('supabase.co')) return;

  const isHTML = e.request.mode === 'navigate'
    || (e.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(VER).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        /* ignoreSearch: the stale-build recovery in app.html reloads with a
           ?cb=<timestamp> cache-buster, and offline that unique URL would
           never match anything — the shell it wants is the same one. */
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true })
            .then((hit) => hit || caches.match('./index.html', { ignoreSearch: true }))
        )
    );
    return;
  }

  /* Assets: cache first, refreshed in the background so the next load picks
     up changes to any non-hashed file (icon.svg, fonts). For the hashed
     bundles the refresh is a no-op by construction. */
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(VER).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => null);
      return cached || fetchPromise;
    })
  );
});
