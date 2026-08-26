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
 *
 * and the balance is the difference:
 *
 *     balance = transplanted in  −  collected
 *
 * which is what the ten percent line is drawn against.
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
 * collecting from never appears.
 *
 * One entry per plot AND batch, not per plot. A D/O collects from a named
 * batch, so a plot holding three of them is three separate blocks of ground
 * being emptied on their own timetables, and rolling them into one row would
 * average away the only figures worth having.
 *
 * @returns {Promise<Array<{ key, plot, batch, nursery, collected, lastDate }>>}
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

  const by = new Map();
  for (const d of res.data || []) {
    if (isCancelled(d)) continue;
    for (const line of collectionLines(d)) {
      const key = `${line.plot}#${line.batch}`;
      if (!by.has(key)) {
        by.set(key, {
          key,
          plot: line.plot,
          batch: line.batch,
          nursery: nurseryOfPlot(line.plot) || '',
          collected: 0,
          lastDate: '',
        });
      }
      const e = by.get(key);
      e.collected += line.qty;
      // The most recent collection, which is what says how far along it is.
      if (String(d.delivery_date || '') > e.lastDate) e.lastDate = d.delivery_date || '';
    }
  }

  /* What went in, against what has come out. Only the blocks being collected
     from are looked up: the transplanting read covers every plot in the
     nursery, and all but these are of no interest here. */
  const planted = await loadTransplanting();
  by.forEach((e) => {
    const t = planted.get(e.key);
    e.transplant = t ? t.qty : 0;
    e.transplantedOn = t ? t.last : '';
    e.balance = e.transplant - e.collected;
  });

  return [...by.values()].sort(
    (a, b) =>
      a.plot.localeCompare(b.plot, undefined, { numeric: true }) ||
      a.batch.localeCompare(b.batch, undefined, { numeric: true })
  );
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
 *   null means "cannot say", which the screen shows as a dash. It is not the
 *   same as zero, and the difference matters: a plot with no figures must not
 *   read as a plot with none left.
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
