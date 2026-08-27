/**
 * Map tiles kept on the phone.
 *
 * A nursery is a place with patchy coverage, and a satellite map that needs a
 * signal is a satellite map that is blank exactly where the work happens. Every
 * tile the map draws is kept here on its way past, so ground that has been
 * looked at once comes back without a bar of signal.
 *
 * IndexedDB rather than the Cache API: this needs a size to show the worker and
 * a button to clear it out, and it has to be able to throw the oldest tiles
 * away when the phone is filling up. A cache the app cannot measure is a cache
 * that quietly eats a phone.
 *
 * Same plumbing as lib/outbox.js, deliberately — one way of talking to
 * IndexedDB in this app, not two.
 */

const DB_NAME = 'mjm_tiles';
const DB_VERSION = 1;
const STORE = 'tiles';

/* How much of the phone this may take. Roughly a nursery and a half of
   working zoom levels. When it is passed, the oldest quarter goes — a quarter
   rather than just enough, so the clear-out is occasional rather than running
   on almost every tile once the cache is full. */
export const TILE_CACHE_MAX_BYTES = 120 * 1024 * 1024;

let _db = null;

function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        // Least-recently-used: `at` is stamped on every read as well as on the
        // write, so the tiles round the plots somebody actually works survive
        // a clear-out and the ones seen once on the way past do not.
        s.createIndex('at', 'at');
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** The key one tile is filed under. Layer included: two layers' z/x/y collide. */
export const tileKey = (layer, z, x, y) => `${layer}/${z}/${x}/${y}`;

/**
 * A tile, if it has been seen before.
 *
 * Returns a Blob, or null. Never throws — a phone with IndexedDB switched off
 * is a phone that fetches every tile, not a phone with a broken map.
 */
export async function getTile(key) {
  try {
    const row = await tx('readonly', (s) => s.get(key));
    if (!row || !row.blob) return null;
    // Touch it, so working ground rises to the top of the LRU. Deliberately
    // not awaited: the map is waiting on this tile, and the bookkeeping is
    // not worth a frame of it.
    tx('readwrite', (s) => s.put({ ...row, at: Date.now() })).catch(() => {});
    return row.blob;
  } catch (e) {
    return null;
  }
}

/** Keep a tile. Never throws, for the same reason. */
export async function putTile(key, blob) {
  try {
    await tx('readwrite', (s) => s.put({
      key, blob, at: Date.now(), bytes: (blob && blob.size) || 0,
    }));
    await sweepIfFull();
  } catch (e) {
    /* Storage full, private mode, quota refused — the map still works, it
       just does not remember. */
  }
}

/** How much is being kept, for the screen that offers to clear it. */
export async function tileUsage() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return {
      count: all.length,
      bytes: all.reduce((n, r) => n + (r.bytes || 0), 0),
    };
  } catch (e) {
    return { count: 0, bytes: 0 };
  }
}

/** Throw the lot away. */
export async function clearTiles() {
  try {
    await tx('readwrite', (s) => s.clear());
  } catch (e) { /* nothing to do about it */ }
}

/* Checked every so often rather than on every single write: counting the whole
   store costs a read of every row, and a map panning across a nursery writes a
   couple of hundred tiles a minute. */
let _writesSinceSweep = 0;

async function sweepIfFull() {
  if (++_writesSinceSweep < 200) return;
  _writesSinceSweep = 0;
  const { bytes } = await tileUsage();
  if (bytes <= TILE_CACHE_MAX_BYTES) return;

  // The oldest quarter, by when each was last actually drawn.
  const all = await tx('readonly', (s) => s.getAll());
  const oldestFirst = all.sort((a, b) => (a.at || 0) - (b.at || 0));
  const drop = oldestFirst.slice(0, Math.ceil(oldestFirst.length / 4));
  await tx('readwrite', (s) => { drop.forEach((r) => s.delete(r.key)); });
}

/** "48 MB" — for the line under the clear button. */
export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
