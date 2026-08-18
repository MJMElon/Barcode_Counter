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
