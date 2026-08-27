import L from 'leaflet';
import { getTile, putTile, tileKey } from '../../../lib/tileStore.js';

/**
 * The satellite layer, and how it survives a nursery with no signal.
 *
 * ── Where the imagery comes from ──
 *
 * Google, as asked for. Worth writing down plainly, because whoever reads this
 * next should know what they are looking at rather than find out the hard way:
 * this is Google's tile endpoint, not the Maps JavaScript API, and using it
 * this way — and keeping the tiles on the phone afterwards — is outside the
 * Maps Platform terms. It works, a great many people do it, and it can be
 * refused at any time without notice.
 *
 * Which is why FALLBACK exists and why the URL is one constant. If Google
 * starts answering 403 the map does NOT go black in the middle of a plot: the
 * layer notices, says so once, and carries on with Esri World Imagery — the
 * same layer the office's own Operation → Settings map already offers, free
 * and attributed. Changing back, or changing to anything else, is one line.
 *
 * ── Why the tiles are kept ──
 *
 * Every tile drawn goes into IndexedDB on the way past (lib/tileStore.js), and
 * every tile is looked for there first. Ground that has been looked at once
 * comes back with no signal at all. Ground nobody has opened yet does not —
 * that is the deal with caching what has been viewed rather than downloading a
 * nursery up front.
 */

/* lyrs=s is satellite alone; lyrs=y would be satellite with roads and labels
   over it, which is noise on an estate where the only roads are ours. */
export const GOOGLE_SAT = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
export const GOOGLE_SUBDOMAINS = ['0', '1', '2', '3'];

/* Free, keyless, attributed, and already the office's Satellite layer. Here as
   the safety net, not as the choice. */
export const FALLBACK_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const GOOGLE_ATTR = 'Imagery © Google';
export const FALLBACK_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics';

/** Zoom 19 is about 30 cm a pixel — a seedling bed is a few pixels across. */
export const MAX_ZOOM = 19;

/**
 * A tile layer that reads the phone first and the network second.
 *
 * Leaflet builds an <img> per tile and sets its src; this overrides that step.
 * The cached blob becomes an object URL, which MUST be revoked when the tile
 * scrolls away or a morning's panning leaks a few hundred megabytes of them.
 */
const CachedTileLayer = L.TileLayer.extend({
  initialize(url, options) {
    L.TileLayer.prototype.initialize.call(this, url, options);
    this._objectUrls = new Map();
    // Set once, the first time Google refuses, so the message is said once
    // rather than once per tile.
    this._fellBack = false;
  },

  createTile(coords, done) {
    const img = document.createElement('img');
    img.alt = '';
    // The tiles are another origin's; without this the canvas would be tainted
    // and the blob could not be read back out.
    img.crossOrigin = 'anonymous';

    const layerName = this.options.layerName || 'sat';
    const key = tileKey(layerName, coords.z, coords.x, coords.y);

    const setBlob = (blob) => {
      const url = URL.createObjectURL(blob);
      this._objectUrls.set(img, url);
      img.src = url;
    };

    (async () => {
      const hit = await getTile(key);
      if (hit) { setBlob(hit); done(null, img); return; }

      try {
        const blob = await this._fetchTile(this.getTileUrl(coords), coords);
        setBlob(blob);
        putTile(key, blob);          // not awaited; the map is waiting
        done(null, img);
      } catch (e) {
        // No signal and never seen: nothing to draw. Leaflet leaves the tile
        // blank, which is the honest answer.
        done(e, img);
      }
    })();

    return img;
  },

  /* One tile, from Google or — once Google has refused — from the fallback.
     A refusal is not retried per tile: the first one flips the whole layer, so
     a nursery does not sit through four hundred failed requests. */
  async _fetchTile(url, coords) {
    if (!this._fellBack) {
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) return await r.blob();
        throw new Error('tile ' + r.status);
      } catch (e) {
        if (!this.options.fallbackUrl) throw e;
        this._fellBack = true;
        console.warn('[tiles] the imagery source refused; falling back:', e && e.message);
        if (this.options.onFallback) this.options.onFallback();
      }
    }
    const fb = L.Util.template(this.options.fallbackUrl, {
      ...coords, s: 'a', z: coords.z, x: coords.x, y: coords.y,
    });
    const r = await fetch(fb, { mode: 'cors' });
    if (!r.ok) throw new Error('tile ' + r.status);
    return await r.blob();
  },

  _abortLoading() {
    L.TileLayer.prototype._abortLoading.call(this);
  },

  /* Leaflet's own hook for a tile leaving the screen. Every object URL made
     above is let go of here. */
  _removeTile(key) {
    const tile = this._tiles[key];
    if (tile && tile.el) {
      const url = this._objectUrls.get(tile.el);
      if (url) { URL.revokeObjectURL(url); this._objectUrls.delete(tile.el); }
    }
    L.TileLayer.prototype._removeTile.call(this, key);
  },

  onRemove(map) {
    this._objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this._objectUrls.clear();
    L.TileLayer.prototype.onRemove.call(this, map);
  },
});

/** The satellite layer this app draws. */
export function satelliteLayer({ onFallback } = {}) {
  return new CachedTileLayer(GOOGLE_SAT, {
    subdomains: GOOGLE_SUBDOMAINS,
    maxZoom: MAX_ZOOM,
    maxNativeZoom: MAX_ZOOM,
    layerName: 'gsat',
    fallbackUrl: FALLBACK_SAT,
    onFallback,
    // Nothing is drawn for a tile that is not there; Leaflet's default is a
    // transparent 1×1, which is the same thing without the console noise.
    errorTileUrl: '',
  });
}
