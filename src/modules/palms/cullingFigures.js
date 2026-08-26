import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { batchKey, plotKey } from '../maintenance/plotBatches.js';
import { currentCycle, cyclesForPlot } from './cullingCycles.js';

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
 * Scoped to ONE INTAKE, not to the plot's whole history and not even to
 * everything standing in it. A plot transplanted in January and again in June
 * holds two intakes, and adding them together netted January's leftovers off
 * against June's stock — which is how a plot came to report a balance below
 * zero while one of its intakes was perfectly healthy. cullingCycles.js splits
 * them; the figures here are the intake currently being collected from.
 */

/* The movements that PUT seedlings in a plot. Matches plotBatches.js, which
   the maintenance module already balances plots with — the two must agree or
   the calculator and the batch picker will name different numbers for the
   same plot. */
const TRANSPLANT_TYPES = ['Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone'];

/* Culling recorded against a PLOT. This is the end of the intake's life on
   this screen, not a running total to display: collection empties the plot,
   the Field Conductor judges what is left against the ten percent line, and
   the remainder is culled. A cull on the ledger means that has happened.

   All four types are read, though in practice only the later two reach a plot:
   1st_Culling and Damaged_Seeds are recorded against the TRAY the seeds were
   sown in, so they land under a tray key and never under U4 or B3. Reading
   them costs nothing and means a plot-stage cull recorded under any of the
   four still ends the intake. */
const CULL_TYPES = ['Damaged_Seeds', '1st_Culling', '2nd_Culling', '3rd_Culling'];

/* A 3rd culling that MOVES the culled seedlings rather than writing them off.
   One log with two sides: plot_name is where they landed, and the remark names
   where they left. The plot they left has been culled just as surely as if the
   seedlings had been destroyed — the balance view already deducts it — so
   missing it left a finished intake sitting on the list with a balance that no
   longer had a cull to explain it. */
const CULL_TRANSFER = 'Cull3_Transfer';

/** → Map(plotKey → { transplant, balance }). Plots with nothing standing in
    them are absent rather than zeroed: no batches is "cannot say", not 0%. */
export async function loadCullingFigures() {
  const [balances, logs, culls, dos] = await Promise.all([
    loadBalances(),
    fetchAllRows(() => supabase
      .from('shared_inventory_logs')
      // The DATE matters as much as the quantity: it is what separates one
      // intake from the next in the same plot.
      .select('transaction_type, plot_name, batch_name, quantity_change, transaction_date, created_at')
      .in('transaction_type', TRANSPLANT_TYPES)
      .order('id', { ascending: true })),
    fetchAllRows(() => supabase
      .from('shared_inventory_logs')
      .select('transaction_type, plot_name, batch_name, quantity_change, remark')
      .in('transaction_type', [...CULL_TYPES, CULL_TRANSFER])
      .order('id', { ascending: true })),
    // Best effort: without the delivery orders the breakdown is short a term,
    // which is worth less than the whole screen failing to load.
    fetchAllRows(() => supabase
      .from('shared_do_records')
      .select('status, remark, plot_1, qty_1, batch_1, plot_2, qty_2, batch_2, ' +
        'plot_3, qty_3, batch_3, plot_4, qty_4, batch_4, plot_5, qty_5, batch_5')
      .order('id', { ascending: true }))
      .then((r) => r, () => ({ data: [] })),
  ]);
  if (logs.error) throw logs.error;

  // plotKey → batchKey → quantity culled off that plot.
  const culledBy = perPlotBatch(cullRows(culls.error ? [] : culls.data || []),
    (r) => r.plot, (r) => batchKey(r.batch),
    (r) => Math.abs(Number(r.qty || 0)));
  const deliveredBy = deliveredPerPlotBatch((dos && dos.data) || []);

  // plotKey → its transplanting rows, kept whole so their dates survive.
  const inBy = new Map();
  for (const l of logs.data || []) {
    const pk = plotKey(l.plot_name);
    if (!pk || !batchKey(l.batch_name)) continue;
    if (!inBy.has(pk)) inBy.set(pk, []);
    inBy.get(pk).push(l);
  }

  const now = new Date().toISOString().slice(0, 7);
  const out = new Map();
  balances.forEach((batches, pk) => {
    /* The plot's intakes, never added together. A plot transplanted in
       January and again in June holds two, and summing them netted January's
       leftovers off against June's stock — which is how a plot came to report
       a balance below zero while one of its intakes was perfectly healthy. */
    const cycles = cyclesForPlot(inBy.get(pk) || [], batches.map(toRow), now, {
      culledBy: culledBy.get(pk) || new Map(),
      deliveredBy: deliveredBy.get(pk) || new Map(),
    });
    const cur = currentCycle(cycles);
    // A plot whose batches were never transplanted in — hand-corrected stock,
    // a batch keyed differently in the two tables — has a balance but no
    // denominator. Reporting 0% there would be a made-up number of exactly
    // the kind this file exists to remove, so it is left out.
    if (!cur) return;
    out.set(pk, {
      transplant: cur.transplant,
      balance: cur.balance,
      intake: cur.label,
      intakes: cycles.filter((c) => c.transplant > 0).length,
      sellsFrom: cur.opens,
      selling: cur.selling,
      // The intake batch by batch, so the calculator can be pointed at one
      // block of ground rather than averaging the plot.
      lines: cur.lines,
      delivered: cur.delivered,
      /* The culling has already been done on this intake, so it is finished:
         the judgement against the ten percent line has been made and what was
         left has been culled. The calculator drops it — offering it again
         would invite a second cull of stock that is no longer there. */
      culled: cur.culled,
      done: cur.done,
    });
  });
  return out;
}

/** Culling as it applies to a PLOT.

    A straight cull is charged to the plot named on the row. A Cull3_Transfer
    is charged to the plot the seedlings LEFT, which the remark names — the
    plot they arrived in has gained stock, not culled any. */
function cullRows(logs) {
  const out = [];
  for (const l of logs) {
    const qty = Math.abs(Number(l.quantity_change || 0));
    if (!qty) continue;
    if (l.transaction_type === 'Cull3_Transfer') {
      const from = String(l.remark || '').match(/From:\s*\[([^\]|]+)\|/);
      if (from) out.push({ plot: plotKey(from[1]), batch: l.batch_name, qty });
      continue;
    }
    out.push({ plot: plotKey(l.plot_name), batch: l.batch_name, qty });
  }
  return out;
}

/** → Map(plotKey → Map(batchKey → qty)). */
function perPlotBatch(rows, plotOf, batchOf, qtyOf) {
  const out = new Map();
  for (const r of rows) {
    const pk = plotOf(r);
    const bk = batchOf(r);
    if (!pk || !bk) continue;
    if (!out.has(pk)) out.set(pk, new Map());
    const m = out.get(pk);
    m.set(bk, (m.get(bk) || 0) + qtyOf(r));
  }
  return out;
}

/** The same shape, from the five collection lines a delivery order carries.
    A cancelled order collected nothing — recorded both ways the office has
    used it, a status and a marker in the remark. */
function deliveredPerPlotBatch(dos) {
  const rows = [];
  for (const d of dos) {
    if (d.status === 'Cancelled' || String(d.remark || '').includes('[CANCELLED]')) continue;
    for (let i = 1; i <= 5; i++) {
      const qty = Math.abs(Number(d[`qty_${i}`] || 0));
      if (!qty) continue;
      rows.push({ plot: d[`plot_${i}`], batch: d[`batch_${i}`], qty });
    }
  }
  return perPlotBatch(rows, (r) => plotKey(r.plot), (r) => batchKey(r.batch), (r) => r.qty);
}

/** The balance map holds { batch, qty }; the cycle model reads batch_name. */
function toRow(b) {
  return { batch_name: b.batch, qty: b.qty };
}

/** → Map(plotKey → [{ batch, qty }]), the batches standing in each plot.
    The view first, the ledger only if the view is unavailable — the same
    order (and the same reasoning) as the maintenance module's batch picker. */
async function loadBalances() {
  const view = await fetchAllRows(() => supabase
    .from('shared_plot_batch_balance')
    // Ordered because the read is PAGED. .range() with no sort leaves the row
    // order up to Postgres, so a plot's rows can repeat in one page and be
    // skipped from the next — and since these figures are summed per plot,
    // a duplicated or missing batch silently moves the balance. Above 1,000
    // rows that is the difference between a plot's real balance and a made-up
    // one. The maintenance module already orders the same read.
    .select('plot_key, plot_name, batch_name, qty')
    .order('plot_key', { ascending: true })
    .order('batch_key', { ascending: true }));
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
