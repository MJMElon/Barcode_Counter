/*
 * The company's site outline, for the maps that draw it.
 *
 * Uploaded once as KML or GPX — 555 FC Portal → Manage → System Setting →
 * Boundary — and kept as GeoJSON in shared_site_boundary, because GeoJSON is
 * the one shape a map library reads without a parser of its own.
 *
 * ── Two doors, one outline ──
 *
 * A Field Conductor is `authenticated` and reads the table. A worker signed in
 * with a PIN is `anon`, cannot read any table, and goes through
 * worker_site_boundary() like everything else in that portal. Which door this
 * is gets worked out here rather than passed down: the GPS map is four
 * components deep inside a work sheet, and threading a data source through all
 * of them to answer one question nobody else asks is a lot of rope for a
 * single outline.
 *
 * ── Offline is the point ──
 *
 * The boundary matters most where there is no signal — that is the whole
 * reason somebody wants an outline on the screen while walking a plot. So the
 * first successful read is kept in localStorage and every later one is served
 * from there first and refreshed behind it. A phone that has synced once has
 * the outline for good; a phone that never has draws no outline and says
 * nothing about it, because a map with no line on it is not an error.
 *
 * LONGITUDE FIRST inside the GeoJSON, which is GeoJSON's own order and the
 * order the track points use. Nothing here reorders anything — Leaflet's
 * L.geoJSON expects exactly that — and the note is here because this is the
 * file somebody would come to when a boundary turns up in the sea.
 */

import { supabase } from './supabase.js';
import { cacheGet, cacheSet } from './cache.js';
import { savedToken } from '../worker/workerApi.js';

const KEY = 'site_boundary';

/* Held for the life of the page as well as in storage: the map is opened and
   closed repeatedly during a morning and each open should not re-read it. */
let memo = null;

/** What was read last time, if anything. Instant, and works with no signal. */
export function cachedBoundary() {
  if (memo) return memo;
  const hit = cacheGet(KEY);
  if (hit && hit.value && hit.value.geojson) {
    memo = hit.value;
    return memo;
  }
  return null;
}

async function readAsFc() {
  const { data, error } = await supabase
    .from('shared_site_boundary')
    .select('geojson, bbox, source_name, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readAsWorker(token) {
  const { data, error } = await supabase.rpc('worker_site_boundary', { p_token: token });
  if (error) throw error;
  return data;
}

/**
 * The outline, from whichever door this is.
 *
 * Never throws and never rejects: a missing boundary, a closed table, an
 * outline nobody has uploaded and a phone in a plot with no bars all come back
 * the same way — whatever is cached, or null. The map draws a line or it does
 * not, and either is a reasonable morning.
 */
export async function loadSiteBoundary() {
  const cached = cachedBoundary();
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = savedToken();

    let row = null;
    if (sess && sess.session) row = await readAsFc();
    else if (token) row = await readAsWorker(token);
    else return cached;

    if (!row || !row.geojson) {
      /* Read the table and it is empty — somebody has REMOVED the boundary.
         Drop the copy too, or a phone that synced in March goes on drawing an
         outline the office has since taken down. */
      cacheSet(KEY, null);
      memo = null;
      return null;
    }

    const value = {
      geojson: row.geojson,
      bbox: row.bbox || null,
      source_name: row.source_name || null,
      updated_at: row.updated_at || null,
    };
    memo = value;
    cacheSet(KEY, value);
    return value;
  } catch (e) {
    /* No signal, no session, no table, no function. All of them mean the same
       thing to a map: draw what was there last time. */
    return cached;
  }
}
