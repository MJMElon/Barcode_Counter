import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { plotKey } from '../maintenance/plotBatches.js';

/**
 * Which plots the Culling Calculator lists.
 *
 * The office raises a Delivery Order in Customer Order Monitoring naming the
 * plot the customer is collecting from. That D/O is what puts the plot on this
 * screen: a collection is happening there, so there is something to count.
 *
 * It used to come from PALMS instead — a plot appeared once somebody had moved
 * its status to Pengambilan. That made the calculator wait on a second person
 * keying a status that the delivery order had already stated as fact, and a
 * plot being collected from was missing until they got round to it.
 *
 * The figures on the row are unaffected: Baki and Transplant still come off
 * the Seedling Stock ledger (cullingFigures.js), and the ledger already takes
 * delivery orders off the balance. So a new D/O both brings its plot in and
 * lowers what that plot has left, without anything being counted twice.
 */

const CACHE_KEY = 'palms_culling_scope_v1';

/** A delivery order carries up to five collection lines. This is them. */
export function doLines(d) {
  const out = [];
  if (!d) return out;
  for (let i = 1; i <= 5; i++) {
    const qty = Number(d[`qty_${i}`] || 0);
    const plot = plotKey(d[`plot_${i}`]);
    if (!plot || !qty) continue;
    out.push({ plot, qty });
  }
  return out;
}

/**
 * A cancelled delivery order collected nothing.
 *
 * Cancellation is recorded two ways in shared_do_records — a status and a
 * marker left in the remark — because the office has used both. Reading only
 * one would put a plot on this screen that nobody is collecting from.
 */
export function isCancelled(d) {
  return d.status === 'Cancelled' || String(d.remark || '').includes('[CANCELLED]');
}

/**
 * → { plots: Set(plotKey), delivered: Map(plotKey → quantity) }
 *
 * `delivered` is every collection off that plot added up, which is what the
 * row can show beside the balance: what has gone, against what is left.
 */
export function deliveryScopeFrom(dos) {
  const plots = new Set();
  const delivered = new Map();
  for (const d of dos || []) {
    if (isCancelled(d)) continue;
    for (const line of doLines(d)) {
      plots.add(line.plot);
      delivered.set(line.plot, (delivered.get(line.plot) || 0) + line.qty);
    }
  }
  return { plots, delivered };
}

/* ---------- on the device ----------
   Cached for the same reason the figures are: a Field Conductor in a nursery
   with no signal still gets the list that was there last time, rather than an
   empty screen. */

export function loadCachedScope() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { plots: new Set(), delivered: new Map() };
    const j = JSON.parse(raw);
    return {
      plots: new Set(j.plots || []),
      delivered: new Map(Object.entries(j.delivered || {})),
    };
  } catch (e) {
    return { plots: new Set(), delivered: new Map() };
  }
}

function cache(scope) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        plots: [...scope.plots],
        delivered: Object.fromEntries(scope.delivered),
      })
    );
  } catch (e) {
    /* a full disk must not stop the calculator running on what it just read */
  }
}

/**
 * Read every delivery order and work out the scope.
 *
 * Best effort, like the other reads on this screen: on failure the cached
 * scope is returned so the calculator still lists what it listed last time.
 */
export async function refreshDeliveryScope() {
  const res = await fetchAllRows(() =>
    supabase
      .from('shared_do_records')
      .select(
        'status, remark, plot_1, qty_1, plot_2, qty_2, plot_3, qty_3, plot_4, qty_4, plot_5, qty_5'
      )
      .order('id', { ascending: true })
  );
  if (res.error) {
    console.warn('[culling] could not read the delivery orders:', res.error.message);
    return { scope: loadCachedScope(), ok: false };
  }
  const scope = deliveryScopeFrom(res.data || []);
  cache(scope);
  return { scope, ok: true };
}
