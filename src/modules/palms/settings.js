// PALMS settings — the bits an admin can change without a code change:
// how a plot is split into areas, and when a plot starts "needing attention".
//
// Kept on the device like the rest of PALMS, so a change made on one phone
// does not reach another. Moving these to Supabase is what would make them
// nursery-wide.

const KEY = 'palms_settings_v1';

// How each plot is divided. `weights` is each area's share of the plot;
// `band` is where that area sits across the width of the map photo, as
// [left%, right%], which is what makes the photo tappable.
export const DEFAULT_MULTI = {
  U8: {
    areas: ['A', 'B', 'C'],
    weights: { A: 33, B: 33, C: 33 },
    band: { A: [0, 35], B: [35, 61], C: [61, 100] },
    cap: 'U8 mempunyai 3 kawasan (A, B, C) — setiap kawasan 33%. Mana-mana 2 kawasan = 70% plot.',
  },
  B1: {
    areas: ['A', 'B'],
    weights: { A: 30, B: 70 },
    band: { A: [0, 51], B: [51, 100] },
    cap: 'B1 mempunyai 2 kawasan (A, B). Kawasan B = 70% plot, kawasan A = 30%.',
  },
  B4: {
    areas: ['A', 'B'],
    weights: { A: 30, B: 70 },
    band: { A: [0, 23], B: [23, 100] },
    cap: 'B4 mempunyai 2 kawasan (A, B). Kawasan B = 70% plot, kawasan A = 30%.',
  },
};

// Activity number -> a plot needs attention once fewer than this many days
// remain before it is due. Anything not listed here is only ever on schedule
// or overdue.
export const DEFAULT_ATTENTION = { 10: 30, 11: 7 };

// An area smaller than this share of its plot does not earn the speed
// incentive: finishing a sliver quickly is not the same achievement as
// finishing a full plot quickly. A plot that is not split is always entitled.
export const DEFAULT_MIN_AREA = 25;

export const AREA_LETTERS = ['A', 'B', 'C', 'D', 'E'];

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        multi: s.multi || clone(DEFAULT_MULTI),
        attention: s.attention || { ...DEFAULT_ATTENTION },
        photos: s.photos || {},
        minArea: s.minArea == null ? DEFAULT_MIN_AREA : Number(s.minArea),
      };
    }
  } catch (e) {
    /* fall through to defaults */
  }
  return {
    multi: clone(DEFAULT_MULTI),
    attention: { ...DEFAULT_ATTENTION },
    photos: {},
    minArea: DEFAULT_MIN_AREA,
  };
}

// Returns false when the browser refuses the write — photos are the usual
// cause, so the caller can say so rather than failing silently.
export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    return false;
  }
}

export function defaultSettings() {
  return {
    multi: clone(DEFAULT_MULTI),
    attention: { ...DEFAULT_ATTENTION },
    photos: {},
    minArea: DEFAULT_MIN_AREA,
  };
}

// Evenly spaced areas are the wrong default: an area worth 30% of the plot
// usually occupies about 30% of the photo. Bands follow the shares.
export function bandsFromWeights(areas, weights) {
  const total = areas.reduce((s, a) => s + (Number(weights[a]) || 0), 0) || 100;
  const band = {};
  let acc = 0;
  areas.forEach((a, i) => {
    const from = Math.round((acc / total) * 100);
    acc += Number(weights[a]) || 0;
    const to = i === areas.length - 1 ? 100 : Math.round((acc / total) * 100);
    band[a] = [from, to];
  });
  return band;
}

// Scaling a photo before it is kept now lives in lib/image.js, shared with
// the maintenance module. Re-exported here so this module's own callers —
// and its 1280px / 0.82 defaults — are untouched.
export { readImageScaled } from '../../lib/image.js';
