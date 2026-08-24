// Real plot outlines, taken from the same Supabase the main portal uses.
//
// Nursery Operation Management already holds an aerial map per nursery
// (operation_nurseries.map_image_url) and a polygon per plot drawn on it
// (shared_plots.map_top — a JSON array of {x, y} in percent of the image).
// Settings reads those rather than keeping its own pictures, so a plot drawn
// once on the main portal is the plot everyone sees here.

import { supabase } from '../../lib/supabase.js';

const CACHE_KEY = 'palms_plot_maps_v1';

export function loadCachedMaps() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Cached so the settings page still draws when the nursery has no signal.
export async function fetchPlotMaps() {
  const [plotsRes, nurRes] = await Promise.all([
    supabase.from('shared_plots').select('nursery_name, plot_name, map_top').order('plot_name'),
    supabase.from('operation_nurseries').select('name, map_image_url').order('name'),
  ]);
  if (plotsRes.error) throw plotsRes.error;
  if (nurRes.error) throw nurRes.error;

  const nurseries = {};
  (nurRes.data || []).forEach((n) => {
    if (n.map_image_url) nurseries[n.name] = n.map_image_url;
  });

  const plots = {};
  (plotsRes.data || []).forEach((p) => {
    const poly = parsePolygon(p.map_top);
    if (poly) plots[p.plot_name] = { nursery: p.nursery_name, poly };
  });

  const maps = { nurseries, plots, at: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(maps));
  } catch (e) {
    /* cache is a convenience, not a requirement */
  }
  return maps;
}

export function parsePolygon(raw) {
  if (!raw || !String(raw).startsWith('[')) return null;
  try {
    const pts = JSON.parse(raw);
    if (!Array.isArray(pts) || pts.length < 3) return null;
    return pts.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  } catch (e) {
    return null;
  }
}

/* ---------- geometry, all in percent-of-image coordinates ---------- */

export function bbox(poly) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Where a hand-drawn divider sits at a given height. The divider is stored as
// the points the finger passed through; between them we interpolate, and
// beyond the ends we hold the end value, so a line drawn across the middle
// still separates the top and bottom of the plot.
export function dividerXAt(line, y) {
  if (!line || !line.length) return 50;
  const pts = [...line].sort((a, b) => a.y - b.y);
  if (y <= pts[0].y) return pts[0].x;
  if (y >= pts[pts.length - 1].y) return pts[pts.length - 1].x;
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i].y) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = b.y - a.y;
      return span === 0 ? b.x : a.x + ((y - a.y) / span) * (b.x - a.x);
    }
  }
  return pts[pts.length - 1].x;
}

/* ---------- tidying a hand-drawn divider ----------
   A finger on a phone does not draw a straight line, and the wobble it leaves
   is not information — nobody means "the boundary jogs one percent left here
   and back again". So the points the finger passed through are cleaned into
   the line the person was plainly aiming for:

     · a stroke that only wobbles becomes the straight line it was aiming at,
       fitted through every point rather than drawn between the two shakiest
     · within a few degrees of upright it is stood exactly upright
     · a stroke that genuinely bends keeps its bend, with the jitter along it
       smoothed away (Ramer–Douglas–Peucker)
     · either way the ends carry on to the top and bottom of the frame, so the
       divider reaches the plot's edges instead of stopping where the finger
       lifted

   Wobble and bend are told apart by averaging the stroke's departure from its
   own best-fit line in bands down its length: jitter falls either side and
   cancels, a bend leans the same way for a stretch. */
const SIMPLIFY_PCT = 2.5; // of the view: how far a point must matter to survive
// How far the line may bow before it counts as a real curve rather than an
// unsteady hand. This is measured on the BOW, not on the worst single point:
// a wobble throws points either side of the intended line and they cancel,
// while a curve leans the same way for a stretch. Judging by the worst point
// instead let one jitter spike keep a plainly straight line crooked.
const BOW_PCT = 2.5;
const UPRIGHT_DEG = 9; // within this of vertical, stand it upright

function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

const r2 = (v) => Math.round(v * 100) / 100;

// The straight line that best fits the stroke, as x = m·y + c. Fitting all the
// points beats joining the first to the last: both ends are as shaky as the
// middle, so a chord drawn between them inherits their error.
function fitLine(pts) {
  const n = pts.length;
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const syy = pts.reduce((s, p) => s + p.y * p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const d = n * syy - sy * sy;
  if (!d) return { m: 0, c: sx / n }; // all at one height: no slope to find
  const m = (n * sxy - sx * sy) / d;
  return { m, c: (sx - m * sy) / n };
}

// How far the stroke leans away from that line, averaged in bands down its
// length. Averaging is what separates a wobble from a curve: jitter either
// side of the line cancels within a band, a bow does not.
function bowOf(pts, fit, bands = 5) {
  const ys = pts.map((p) => p.y);
  const y0 = Math.min(...ys);
  const span = Math.max(...ys) - y0 || 1;
  const sums = new Array(bands).fill(0);
  const counts = new Array(bands).fill(0);
  pts.forEach((p) => {
    const b = Math.min(bands - 1, Math.floor(((p.y - y0) / span) * bands));
    sums[b] += p.x - (fit.m * p.y + fit.c);
    counts[b]++;
  });
  let bow = 0;
  for (let i = 0; i < bands; i++) {
    if (counts[i]) bow = Math.max(bow, Math.abs(sums[i] / counts[i]));
  }
  return bow;
}

export function tidyDivider(line, view) {
  if (!line || line.length < 2) return line;
  const v = view || { x: 0, y: 0, w: 100, h: 100 };
  const scale = Math.max(v.w, v.h);
  const top = v.y;
  const bottom = v.y + v.h;
  const clampX = (x) => Math.min(v.x + v.w, Math.max(v.x, x));

  // Top to bottom: the only direction this model reads a divider in.
  let pts = [...line].sort((a, b) => a.y - b.y);

  const at = (p, q, y) => (q.y === p.y ? p.x : p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));

  const fit = fitLine(pts);
  if (bowOf(pts, fit) <= (BOW_PCT / 100) * scale) {
    // Straight: two points, top of the frame to bottom, and nothing in
    // between to go crooked again.
    const deg = Math.abs((Math.atan(fit.m) * 180) / Math.PI);
    if (deg <= UPRIGHT_DEG) {
      const x = r2(clampX(fit.m * ((top + bottom) / 2) + fit.c));
      return [
        { x, y: r2(top) },
        { x, y: r2(bottom) },
      ];
    }
    return [
      { x: r2(clampX(fit.m * top + fit.c)), y: r2(top) },
      { x: r2(clampX(fit.m * bottom + fit.c)), y: r2(bottom) },
    ];
  }

  // A real curve: keep its shape, drop the jitter, and carry the ends out to
  // the frame along the direction each end was heading.
  pts = rdp(pts, (SIMPLIFY_PCT / 100) * scale);
  if (pts[0].y > top) pts = [{ x: clampX(at(pts[0], pts[1], top)), y: top }, ...pts];
  const n = pts.length;
  if (pts[n - 1].y < bottom) {
    pts = [...pts, { x: clampX(at(pts[n - 1], pts[n - 2], bottom)), y: bottom }];
  }

  return pts.map((p) => ({ x: r2(p.x), y: r2(p.y) }));
}

// Areas run left to right in the order the dividers were drawn.
export function areaIndexAt(dividers, pt) {
  let i = 0;
  const sorted = sortDividers(dividers);
  for (const d of sorted) {
    if (pt.x > dividerXAt(d, pt.y)) i++;
    else break;
  }
  return i;
}

// Left-to-right by their average position, so drawing them out of order still
// labels the areas A, B, C from the left.
export function sortDividers(dividers) {
  return [...(dividers || [])].sort((a, b) => meanX(a) - meanX(b));
}
function meanX(line) {
  return line.reduce((s, p) => s + p.x, 0) / (line.length || 1);
}

// The share each area takes of the plot, measured off the drawing rather than
// typed in: sample a grid over the plot's outline and count where each sample
// falls. With no outline available, the image rectangle stands in for it.
// 160 samples a side keeps a straight line at a round percentage; coarser
// grids left a 25% area reading 26%. It runs once, on save.
export function weightsFromDividers(areas, dividers, poly, steps = 160) {
  const counts = new Array(areas.length).fill(0);
  let total = 0;
  const box = poly ? bbox(poly) : { x: 0, y: 0, w: 100, h: 100 };
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const pt = {
        x: box.x + ((i + 0.5) / steps) * box.w,
        y: box.y + ((j + 0.5) / steps) * box.h,
      };
      if (poly && !pointInPolygon(pt, poly)) continue;
      total++;
      const idx = Math.min(areas.length - 1, areaIndexAt(dividers, pt));
      counts[idx]++;
    }
  }
  const w = {};
  if (!total) {
    areas.forEach((a) => (w[a] = Math.round(100 / areas.length)));
    return w;
  }
  // Largest-remainder rounding so the shares always total exactly 100.
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < left; k++) out[order[k % order.length].i]++;
  areas.forEach((a, i) => (w[a] = out[i]));
  return w;
}
