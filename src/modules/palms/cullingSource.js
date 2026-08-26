import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { batchKey, plotKey } from '../maintenance/plotBatches.js';
import { nurseryOfPlot } from './data.js';

/**
 * Where the Culling Calculator's numbers come from.
 *
 * The whole calculation was taken out to be rebuilt, and this is the one place
 * it goes back in. The screen reads only from here, so wiring the calculator
 * up means filling in these functions and touching nothing else.
 *
 * Two reads, both against one block — a plot AND a batch:
 *
 *   pengambilan   Customer Order Monitoring. A Delivery Order collecting from
 *                 a plot is what says that plot is being collected from, and
 *                 the sum of those collections is what has gone.
 *   transplanting The Batch Report's Transplanting tab, which records the
 *                 date, the plot, the batch and the quantity that went in.
 *   3rd culling   Also the Batch Report. A 3rd culling against a block means
 *                 that block is finished, and it leaves the screen.
 *
 * and the balance is the difference:
 *
 *     balance = transplanted in  −  collected
 *
 * which is what the ten percent line is drawn against.
 *
 * EVERY one of those reads is matched on the plot AND the batch together.
 * Neither is enough on its own: one plot holds several batches, and one batch
 * can be spread over several plots, so matching on either alone would pour
 * one block's figures into another's.
 *
 * What was removed, in case any of it is worth having back (git has it all,
 * up to commit f79a4c5):
 *
 *   cullingScope.js    which plots to list, taken from the delivery orders
 *   cullingFigures.js  the ledger reads behind Transplant and Baki
 *   cullingCycles.js   splitting a plot into intakes by transplanting month,
 *                      the batches inside one, and the selling window
 *   cullingData.js     cullingRate, hasFigures, figuresBroken
 */

/**
 * Which plots are in pengambilan, and which batch of each.
 *
 * A plot is in pengambilan when a customer is collecting off it, and the
 * Customer Order Monitoring page is where that is said: a Delivery Order names
 * the plot and the batch the seedlings came from. So a collection on a D/O is
 * what puts a plot on this screen, and nothing else does — a plot nobody is
 * collecting from never appears, and nor does a -R plot however much is
 * collected off it.
 *
 * One entry per plot AND batch, not per plot. A D/O collects from a named
 * batch, so a plot holding three of them is three separate blocks of ground
 * being emptied on their own timetables, and rolling them into one row would
 * average away the only figures worth having.
 *
 * @returns {Promise<Array<{ key, plot, batch, nursery, collected, firstDate,
 *   lastDate, transplant, transplantedOn, balance, daysCollecting }>>}
 *   `key` is what the screen selects on — a plot alone is not unique once its
 *   batches are separated.
 */
export async function loadPlots() {
  const res = await fetchAllRows(() =>
    supabase
      .from('shared_do_records')
      .select(
        'do_number, delivery_date, status, remark, ' +
          'plot_1, batch_1, qty_1, plot_2, batch_2, qty_2, plot_3, batch_3, qty_3, ' +
          'plot_4, batch_4, qty_4, plot_5, batch_5, qty_5'
      )
      .order('id', { ascending: true })
  );
  if (res.error) {
    console.warn('[culling] could not read the delivery orders:', res.error.message);
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);
  const by = new Map();
  for (const d of res.data || []) {
    if (isCancelled(d)) continue;
    for (const line of collectionLines(d)) {
      if (isReplantPlot(line.plot)) continue;
      if (isOldBatch(line.batch)) continue;
      const key = `${line.plot}#${line.batch}`;
      if (!by.has(key)) {
        by.set(key, {
          key,
          plot: line.plot,
          batch: line.batch,
          nursery: nurseryOfPlot(line.plot) || '',
          collected: 0,
          firstDate: '',   // when collection opened on this block
          lastDate: '',    // and the most recent one
        });
      }
      const e = by.get(key);
      e.collected += line.qty;
      /* Both ends of the collection. The FIRST is when pengambilan opened on
         this block, which is what says how far through it is; the last is
         only the most recent order. */
      const on = String(d.delivery_date || '');
      if (on) {
        if (!e.firstDate || on < e.firstDate) e.firstDate = on;
        if (on > e.lastDate) e.lastDate = on;
      }
    }
  }

  /* What went in, and what has finished. Both are matched on the same
     plot-and-batch key the collections were gathered under, so a figure can
     only ever meet the block it actually belongs to. */
  const [planted, finished] = await Promise.all([loadTransplanting(), loadFinished()]);
  by.forEach((e) => {
    const t = planted.get(e.key);
    e.transplant = t ? t.qty : 0;
    e.transplantedOn = t ? t.last : '';
    e.balance = e.transplant - e.collected;
    // How long collection has been running on this block.
    e.daysCollecting = daysSince(e.firstDate, today);
  });

  /* A 3rd culling against a block means the Field Conductor has already
     judged what was left and culled it. The block is finished: offering it
     again would invite a second count of stock that is no longer standing.

     And a block the transplanting report has never heard of is dropped
     outright. A delivery order's batch column is typed by hand, so B11 batch
     232 can be collected against on paper when no batch 232 ever went into
     B11 — there is no transplanted-in figure to subtract from, so there is no
     balance and nothing here to judge. */
  return [...by.values()]
    .filter((e) => e.transplant > 0 && !finished.has(e.key))
    .sort(byReadiness);
}

/** Collection runs about a month, so a block a month into it is the one worth
    walking. */
export const COLLECTION_DAYS = 30;

/**
 * How ready a block is to be counted — smaller is sooner.
 *
 * A block a month into its collection is nearly empty and is what the Field
 * Conductor came here for; one that opened last week has nothing to judge yet.
 * So the list is ordered by how close each is to that month.
 *
 * Anything PAST the month is treated as having arrived rather than as having
 * overshot. Ranking by distance alone would send a block sixty days in to the
 * back of the list beside one that opened yesterday, and the sixty-day one is
 * the more overdue of the two, not the less interesting.
 *
 * A block with no collection date cannot be placed and goes last.
 */
export function readiness(row) {
  const d = row && row.daysCollecting;
  if (d == null) return Infinity;
  return d >= COLLECTION_DAYS ? 0 : COLLECTION_DAYS - d;
}

/** The order the list is in. Exported so it can be driven on its own —
    a comparator buried inside the read is a comparator nothing can check. */
export function byReadiness(a, b) {
  return (
    readiness(a) - readiness(b) ||
    // Among those already past the month, the longest-running first.
    (b.daysCollecting || 0) - (a.daysCollecting || 0) ||
    a.plot.localeCompare(b.plot, undefined, { numeric: true }) ||
    a.batch.localeCompare(b.batch, undefined, { numeric: true })
  );
}

/** Whole days from a date to another, or null when either is missing. */
export function daysSince(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* Transplanting puts seedlings INTO a plot. Three types, because the Batch
   Report offers three destinations; only the first reaches a numbered plot,
   but reading all three costs nothing and matches the office movement report
   rather than being a second opinion on it. */
const TRANSPLANT_TYPES = ['Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone'];

/**
 * What the Batch Report says was transplanted in, per plot and batch.
 *
 * @returns {Promise<Map<string, { qty: number, first: string, last: string }>>}
 *   keyed the same way as the delivery orders, "PLOT#BATCH", so the two sides
 *   of the balance meet on the same key however loosely either was typed.
 */
export async function loadTransplanting() {
  const res = await fetchAllRows(() =>
    supabase
      .from('shared_inventory_logs')
      .select('plot_name, batch_name, quantity_change, transaction_date, created_at')
      .in('transaction_type', TRANSPLANT_TYPES)
      .order('id', { ascending: true })
  );
  if (res.error) {
    console.warn('[culling] could not read the transplanting:', res.error.message);
    return new Map();
  }
  return transplantedByBlock(res.data || []);
}

/* The end of a block's life on this screen. A 3rd culling is the last cull
   there is, and once it is on the ledger the block has been judged and
   cleared.

   Cull3_Transfer counts as one: it is a 3rd culling whose seedlings were
   moved rather than written off, and one log carries both sides — plot_name
   is where they landed, and the remark names the plot they LEFT. It is the
   plot they left that has been culled. */
const FINISH_TYPES = ['3rd_Culling', 'Cull3_Transfer'];

/** → Set of "PLOT#BATCH" that a 3rd culling has finished. */
export async function loadFinished() {
  const res = await fetchAllRows(() =>
    supabase
      .from('shared_inventory_logs')
      .select('transaction_type, plot_name, batch_name, quantity_change, remark')
      .in('transaction_type', FINISH_TYPES)
      .order('id', { ascending: true })
  );
  if (res.error) {
    console.warn('[culling] could not read the 3rd culling:', res.error.message);
    return new Set();
  }
  return finishedBlocks(res.data || []);
}

/** The same, from rows already in hand. */
export function finishedBlocks(rows) {
  const out = new Set();
  for (const l of rows || []) {
    const qty = Math.abs(Number(l.quantity_change || 0));
    const batch = batchKey(l.batch_name);
    if (!qty || !batch) continue;
    if (l.transaction_type === 'Cull3_Transfer') {
      // The plot it LEFT, which only the remark names.
      const from = String(l.remark || '').match(/From:\s*\[([^\]|]+)\|/);
      const plot = from ? plotKey(from[1]) : '';
      if (plot) out.add(`${plot}#${batch}`);
      continue;
    }
    const plot = plotKey(l.plot_name);
    if (plot) out.add(`${plot}#${batch}`);
  }
  return out;
}


/** The same, from rows already in hand — so the rule is testable without a
    database behind it. */
export function transplantedByBlock(rows) {
  const out = new Map();
  for (const l of rows || []) {
    const plot = plotKey(l.plot_name);
    const batch = batchKey(l.batch_name);
    const qty = Math.abs(Number(l.quantity_change || 0));
    if (!plot || !batch || !qty) continue;
    const key = `${plot}#${batch}`;
    if (!out.has(key)) out.set(key, { qty: 0, first: '', last: '' });
    const e = out.get(key);
    e.qty += qty;
    /* The date the office recorded the transplanting on, falling back to when
       the row was written. A batch can go in over several days, so both ends
       are kept rather than one being made to stand for the whole. */
    const on = String(l.transaction_date || l.created_at || '').slice(0, 10);
    if (on) {
      if (!e.first || on < e.first) e.first = on;
      if (on > e.last) e.last = on;
    }
  }
  return out;
}

/** The five collection lines a delivery order carries, as rows. A line needs
    both a plot and a quantity to be a collection; a batch is how the block is
    named, and a line without one cannot be separated from its neighbours. */
export function collectionLines(d) {
  const out = [];
  if (!d) return out;
  for (let i = 1; i <= 5; i++) {
    const qty = Math.abs(Number(d[`qty_${i}`] || 0));
    const plot = plotKey(d[`plot_${i}`]);
    const batch = batchKey(d[`batch_${i}`]);
    if (!plot || !qty || !batch) continue;
    out.push({ plot, batch, qty });
  }
  return out;
}

/**
 * The -R plots, which do not belong on this screen.
 *
 * B4 and B4-R are different ground, and only the first is counted here. The
 * suffix is kept by plotKey rather than trimmed, which is what makes them
 * possible to tell apart at all — so the two never share a row, and the -R one
 * simply never opens one.
 *
 * A trailing number is allowed for, so B4-R and B4-R2 are both left out.
 */
export function isReplantPlot(plot) {
  return /-R\d*$/.test(String(plot || ''));
}

/**
 * The oldest batch this screen carries.
 *
 * Everything before 224 is old ground that has been through its culling
 * already, and a stray delivery order against one of them is history rather
 * than work. So the list starts here.
 *
 * 224 itself is kept — "before 224" is what is left out.
 */
export const MIN_BATCH = 224;

/** Whether a batch is older than the screen goes back. */
export function isOldBatch(batch) {
  const n = parseInt(batchKey(batch), 10);
  // A batch with no number in it cannot be placed either side of the line,
  // and collectionLines has already refused it, so it never reaches here.
  return Number.isFinite(n) && n < MIN_BATCH;
}

/** A cancelled order collected nothing. The office has recorded cancellation
    two ways — a status, and a marker left in the remark — so both are read;
    missing either would put a plot here that nobody is collecting from. */
export function isCancelled(d) {
  return d.status === 'Cancelled' || String(d.remark || '').includes('[CANCELLED]');
}

/**
 * The figures behind one plot.
 *
 * @param   {{ plot: string, batch: string }} block  a plot AND a batch — the
 *          list is split by batch, so figures are per block, not per plot.
 * @returns {{ transplant: number, balance: number } | null}
 *   null means "cannot say". A block loadPlots hands over never answers null,
 *   because a block with nothing transplanted into it is not listed at all —
 *   the guard is kept so that stays true rather than being assumed.
 */
export function figuresFor(block) {
  if (!block || !(block.transplant > 0)) return null;
  return { transplant: block.transplant, balance: block.balance };
}

/**
 * Whether a plot's figures can carry a rate at all.
 *
 * Kept separate from figuresFor so a plot can be listed with its figures
 * shown and still be refused a percentage — a balance the ledger cannot
 * explain should be visible, not silently rated.
 */
export function hasFigures(row) {
  return !!row && row.transplant > 0 && row.balance >= 0;
}

/**
 * Whether a block's figures cannot be trusted at all.
 *
 * A balance the ledger could not explain — more recorded leaving than ever
 * arrived — used to answer this. The screen still has the panel for it: the
 * block is named and its balance shown, but no rate is offered, because a
 * rate worked out from a figure that does not add up reads as a healthy plot.
 */
export function figuresBroken(block) {
  return !!block && block.transplant > 0 && block.balance < 0;
}

/**
 * The culling rate.
 *
 * @param   {{ balance: number, transplant: number, inang: number }} figures
 *   `inang` is what the Field Conductor has counted on the keypad so far.
 * @returns {number} a fraction — 0.1 is ten percent. NaN when there is no
 *   rate to be had, which the screen shows as a dash rather than as 0%.
 */
export function rateFor({ balance, transplant, inang }) {
  if (!(transplant > 0)) return NaN;
  /* Pokok inang screened out are kept back, so they come off what would
     otherwise be culled. Before any are counted `inang` is nothing and the
     rate is simply what is left as a share of what went in. */
  return (balance - (inang || 0)) / transplant;
}
