import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { batchKey, plotKey } from '../maintenance/plotBatches.js';

/**
 * The Culling Calculator's two figures, from the Seedling Stock system.
 *
 * Transplant and Baki used to be random numbers dealt in the browser — a
 * trial stand-in from before there was a backend — so the culling rate was
 * arithmetic on invented data. Both now come off the same ledger the office
 * movement report is built from, which is the only way the rate a Field
 * Conductor is asked to act on can mean anything.
 *
 *   Baki (balance)  what is still standing in the plot right now
 *   Transplant      what was transplanted in to put it there
 *
 * Scoped to the BATCHES CURRENTLY IN THE PLOT, not to the plot's whole
 * history. A plot goes round the cycle again and again; measuring this
 * intake's balance against every seedling ever transplanted into that plot
 * would sink the rate a little further every year until it meant nothing.
 * So the batches standing there now decide the denominator too.
 */

/* The movements that PUT seedlings in a plot. Matches plotBatches.js, which
   the maintenance module already balances plots with — the two must agree or
   the calculator and the batch picker will name different numbers for the
   same plot. */
const TRANSPLANT_TYPES = ['Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone'];

/** → Map(plotKey → { transplant, balance }). Plots with nothing standing in
    them are absent rather than zeroed: no batches is "cannot say", not 0%. */
export async function loadCullingFigures() {
  const [balances, logs] = await Promise.all([
    loadBalances(),
    fetchAllRows(() => supabase
      .from('shared_inventory_logs')
      .select('transaction_type, plot_name, batch_name, quantity_change')
      .in('transaction_type', TRANSPLANT_TYPES)
      .order('id', { ascending: true })),
  ]);
  if (logs.error) throw logs.error;

  // plotKey → batchKey → transplanted-in quantity
  const inQty = new Map();
  for (const l of logs.data || []) {
    const pk = plotKey(l.plot_name);
    const bk = batchKey(l.batch_name);
    if (!pk || !bk) continue;
    if (!inQty.has(pk)) inQty.set(pk, new Map());
    const m = inQty.get(pk);
    m.set(bk, (m.get(bk) || 0) + Math.abs(Number(l.quantity_change || 0)));
  }

  const out = new Map();
  balances.forEach((batches, pk) => {
    let balance = 0;
    let transplant = 0;
    const seen = inQty.get(pk) || new Map();
    for (const b of batches) {
      balance += b.qty;
      transplant += seen.get(batchKey(b.batch)) || 0;
    }
    // A plot whose batches were never transplanted in — hand-corrected stock,
    // a batch keyed differently in the two tables — has a balance but no
    // denominator. Reporting 0% there would be a made-up number of exactly
    // the kind this file exists to remove, so it is left out.
    if (transplant > 0) out.set(pk, { transplant, balance });
  });
  return out;
}

/** → Map(plotKey → [{ batch, qty }]), the batches standing in each plot.
    The view first, the ledger only if the view is unavailable — the same
    order (and the same reasoning) as the maintenance module's batch picker. */
async function loadBalances() {
  const view = await fetchAllRows(() => supabase
    .from('shared_plot_batch_balance')
    .select('plot_key, plot_name, batch_name, qty'));
  if (!view.error) return groupBalances(view.data || [], (r) => r.plot_key || plotKey(r.plot_name));

  console.warn('[culling] plot balance view unavailable, reading the ledger:', view.error.message);
  const { batchesByPlot } = await import('../maintenance/plotBatches.js');
  const [ledger, dos] = await Promise.all([
    fetchAllRows(() => supabase.from('shared_inventory_logs')
      .select('transaction_type, plot_name, batch_name, quantity_change, remark')
      .in('transaction_type', ['Seeds_Received', 'Planted', 'Transplanted',
        'Transplanted_Premium', 'Transplanted_DoubleTone', 'Damaged_Seeds',
        '1st_Culling', '2nd_Culling', '3rd_Culling', 'Cull3_Transfer'])
      .order('id', { ascending: true })),
    fetchAllRows(() => supabase.from('shared_do_records')
      .select('status, remark, plot_1, qty_1, batch_1, plot_2, qty_2, batch_2, plot_3, qty_3, batch_3, plot_4, qty_4, batch_4, plot_5, qty_5, batch_5')
      .order('id', { ascending: true }))
      .then((r) => r, () => ({ data: [] })),
  ]);
  if (ledger.error) throw ledger.error;
  return batchesByPlot(ledger.data || [], (dos && dos.data) || []);
}

function groupBalances(rows, keyOf) {
  const out = new Map();
  for (const r of rows) {
    const pk = keyOf(r);
    if (!pk) continue;
    if (!out.has(pk)) out.set(pk, []);
    out.get(pk).push({ batch: r.batch_name, qty: Number(r.qty || 0) });
  }
  return out;
}
