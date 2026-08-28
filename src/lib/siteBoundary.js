/*
 * The site outlines, for the maps that draw them.
 *
 * ONE PER NURSERY. They are separate sites with a file each — 555 FC Portal →
 * Manage → System Setting → Boundary, a nursery at a time — kept as GeoJSON in
 * shared_site_boundary, because GeoJSON is the one shape a map library reads
 * without a parser of its own.
 *
 * Everything below deals in a LIST, never a single outline, and an empty list
 * is an ordinary answer. A phone shows the ones for the ground its holder
 * works: a worker gets the nurseries inside their own boundary, decided in the
 * database where an app that has been tampered with cannot argue with it; a
 * Field Conductor is an office account and gets all of them, because they move
 * between nurseries and the table is theirs to read anyway.
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

const KEY = 'site_boundaries';

/* Held for the life of the page as well as in storage: the map is opened and
   closed repeatedly during a morning and each open should not re-read them. */
let memo = null;

const usable = (list) => (Array.isArray(list) ? list.filter((b) => b && b.geojson) : []);

/** What was read last time. Instant, works with no signal, [] if never. */
export function cachedBoundaries() {
  if (memo) return memo;
  const hit = cacheGet(KEY);
  memo = usable(hit && hit.value);
  return memo;
}

async function readAsFc() {
  const { data, error } = await supabase
    .from('shared_site_boundary')
    .select('nursery, geojson, bbox, source_name, updated_at');
  if (error) throw error;
  return data || [];
}

async function readAsWorker(token) {
  const { data, error } = await supabase.rpc('worker_site_boundary', { p_token: token });
  if (error) throw error;
  /* An older install of the function answered with one outline rather than a
     list. Reading both shapes costs a line and means a phone that has not
     caught up with the database does not go blank. */
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * The outlines, from whichever door this is.
 *
 * Never throws and never rejects: a nursery with no file, a closed table, a
 * database that has not had the migration run, and a phone in a plot with no
 * bars all come back the same way — whatever is cached, or an empty list. The
 * map draws some lines or it does not, and either is a reasonable morning.
 */
export async function loadSiteBoundaries() {
  const cached = cachedBoundaries();
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = savedToken();

    let rows = null;
    if (sess && sess.session) rows = await readAsFc();
    else if (token) rows = await readAsWorker(token);
    else return cached;

    const value = usable(rows).map((r) => ({
      nursery: r.nursery || null,
      geojson: r.geojson,
      bbox: r.bbox || null,
      source_name: r.source_name || null,
      updated_at: r.updated_at || null,
    }));

    /* Written even when it is empty, and that is the point: somebody has
       REMOVED an outline, or all of them, and a phone that synced in March
       must stop drawing what the office has taken down. */
    memo = value;
    cacheSet(KEY, value);
    return value;
  } catch (e) {
    /* No signal, no session, no table, no function. All of them mean the same
       thing to a map: draw what was there last time. */
    return cached;
  }
}
