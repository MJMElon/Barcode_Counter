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
 *   3rd culling   Also the Batch Report. A block leaves this screen when its
 *                 3rd culling row carries a drone MAP QUANTITY — not when it
 *                 carries a culled figure, which goes in while the counting
 *                 is still under way.
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
 * Per batch, not per plot — but only where the batches are really separate
 * jobs. A D/O collects from a named batch, and a plot holding three of them
 * emptied a season apart is three blocks of ground on their own timetables,
 * which one row would average away. Batches emptied at the same time are the
 * opposite case: one visit, one count, one row. So a plot's batches are split
 * by WHEN their collection opened rather than by name, a month apart being
 * the line — see mergeNearBatches.
 *
 * @returns {Promise<Array<{ key, plot, batch, batches, nursery, collected,
 *   firstDate, lastDate, transplant, transplantedOn, balance, daysCollecting }>>}
 *   `key` is what the screen selects on — a plot alone is not unique once its
 *   batches are separated. `batch` reads as "237 + 242" where several were
 *   fused, and `batches` lists them.
 */
/** Every delivery order, or null if they could not be read. Its own function
    so the diagnosis below reads exactly what the list reads. */
async function loadDeliveryOrders() {
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
    return null;
  }
  return res.data || [];
}

export async function loadPlots() {
  const dos = await loadDeliveryOrders();
  if (!dos) return [];

  const today = new Date().toISOString().slice(0, 10);
  const by = new Map();
  for (const d of dos) {
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
  });

  /* A map quantity against a block means the drone has flown it and the count
     is settled. The block is finished: offering it again would invite a
     second count of stock that is no longer standing.

     And a block the transplanting report has never heard of is dropped
     outright. A delivery order's batch column is typed by hand, so B11 batch
     232 can be collected against on paper when no batch 232 ever went into
     B11 — there is no transplanted-in figure to subtract from, so there is no
     balance and nothing here to judge. */
  const live = [...by.values()].filter((e) => e.transplant > 0 && !finished.has(e.key));

  /* Batches of one plot being emptied at the same time are one job. Every
     rule above has already been applied to each batch on its own, so a batch
     that is finished or was never planted cannot pull a live one into a row
     with it. */
  const rows = mergeNearBatches(live);
  rows.forEach((e) => { e.daysCollecting = daysSince(e.firstDate, today); });
  return rows.sort(byReadiness);
}

/**
 * How far apart two batches of one plot may start and still be one job.
 *
 * A month, because that is how long collecting a block takes: batches that
 * opened within a month of each other are being emptied together and are
 * walked together.
 */
export const MERGE_DAYS = 31;

/**
 * Batches of the SAME plot whose collections opened close together, fused
 * into one row.
 *
 * Plot A's first batch opening on 1 July and its second on 1 August is one
 * visit, not two: the Field Conductor walks the plot once and counts what is
 * standing in it. Splitting them would send him back to the same ground twice
 * in a month and make him judge each half against a rate the other half is
 * also part of.
 *
 * Two things this deliberately does NOT do. It never fuses across plots —
 * plot B opening on 15 July is its own ground and its own row, however close
 * its dates are to plot A's. And it never lets a group run away: a batch
 * joins only if it opened within a month of the EARLIEST in the group, so
 * July, August and September stay two rows rather than chaining into one
 * quarter-long block through a series of small steps.
 *
 * A batch with no collection date cannot be placed on the timeline, so it
 * stands on its own rather than being folded into whatever it sorts beside.
 */
export function mergeNearBatches(blocks) {
  const byPlot = new Map();
  for (const b of blocks || []) {
    if (!byPlot.has(b.plot)) byPlot.set(b.plot, []);
    byPlot.get(b.plot).push(b);
  }

  const out = [];
  byPlot.forEach((list) => {
    const dated = list
      .filter((b) => b.firstDate)
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate));
    let group = [];
    for (const b of dated) {
      if (group.length && daysSince(group[0].firstDate, b.firstDate) > MERGE_DAYS) {
        out.push(fuse(group));
        group = [];
      }
      group.push(b);
    }
    if (group.length) out.push(fuse(group));
    for (const b of list) if (!b.firstDate) out.push(b);
  });
  return out;
}

/** One row from several batches: the figures add up, the dates take the
    widest span, and the batch reads as all of them. */
function fuse(group) {
  if (group.length === 1) return group[0];
  const batches = group
    .map((b) => b.batch)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const widest = (pick, better) => group.reduce((m, b) => (better(pick(b), m) ? pick(b) : m), '');
  const collected = group.reduce((n, b) => n + b.collected, 0);
  const transplant = group.reduce((n, b) => n + b.transplant, 0);
  return {
    ...group[0],
    // The key still names the ground, so a selection survives a refresh.
    key: `${group[0].plot}#${batches.join('+')}`,
    batch: batches.join(' + '),
    batches,
    collected,
    transplant,
    balance: transplant - collected,
    // When collection opened on the FIRST of them — the job started then.
    firstDate: widest((b) => b.firstDate, (v, m) => !!v && (!m || v < m)),
    lastDate: widest((b) => b.lastDate, (v, m) => v > m),
    transplantedOn: widest((b) => b.transplantedOn, (v, m) => v > m),
  };
}

/**
 * Why a block is on this screen, or why it is not.
 *
 * A block that ought to be here and is not has been stopped by exactly one of
 * the rules above, and from the screen there is no way to tell which — the
 * list simply does not have it. This walks every collection line on every
 * delivery order and says, per line, which rule it fell at, in the order the
 * list applies them.
 *
 * Run it from the browser's console with the calculator open:
 *
 *     cullDebug('B4')            every line for a plot
 *     cullDebug('U17', '237')    one block
 *     cullDebug()                all of them
 *
 * @param   {string} plot   optional, to narrow it
 * @param   {string} batch  optional, likewise
 * @returns {Promise<Array<{ do, on, plot, batch, qty, transplanted, why }>>}
 *   `why` is 'LISTED' or the rule that stopped it.
 */
export async function diagnose(plot = '', batch = '') {
  const wantPlot = plotKey(plot);
  const wantBatch = batchKey(batch);
  const dos = await loadDeliveryOrders();
  if (!dos) return [{ why: 'the delivery orders could not be read at all' }];
  const [planted, finished] = await Promise.all([loadTransplanting(), loadFinished()]);

  const out = [];
  for (const d of dos) {
    for (let i = 1; i <= 5; i++) {
      const rawPlot = d[`plot_${i}`];
      const rawBatch = d[`batch_${i}`];
      const rawQty = d[`qty_${i}`];
      // An untouched line slot is not a collection anybody expected to see.
      if (!rawPlot && !rawBatch && !rawQty) continue;

      const p = plotKey(rawPlot);
      const b = batchKey(rawBatch);
      const q = Math.abs(Number(rawQty || 0));
      if (wantPlot && p !== wantPlot) continue;
      if (wantBatch && b !== wantBatch) continue;

      const t = planted.get(`${p}#${b}`);
      out.push({
        do: d.do_number,
        on: d.delivery_date,
        plot: rawPlot,
        batch: rawBatch,
        qty: rawQty,
        transplanted: t ? t.qty : 0,
        why: whyNot(d, p, b, q, planted, finished),
      });
    }
  }
  return out;
}

/**
 * What the batch report actually holds near a block — every batch that went
 * into this plot, and every plot this batch went into.
 *
 * The commonest answer diagnose() gives is that the batch report has no such
 * batch in that plot, and the next question is always the same: then what IS
 * in there? Two plot-and-batch keys that should have met and did not are
 * usually a plot named one way on the delivery order and another in the batch
 * report — B4 against B4-1 — and seeing both lists side by side is what makes
 * that visible.
 */
export async function plantedNear(plot = '', batch = '') {
  const wantPlot = plotKey(plot);
  const wantBatch = batchKey(batch);
  const planted = await loadTransplanting();
  const out = [];
  planted.forEach((v, key) => {
    const [p, b] = key.split('#');
    const samePlot = wantPlot && p === wantPlot;
    const sameBatch = wantBatch && b === wantBatch;
    if (!samePlot && !sameBatch) return;
    out.push({
      plot: p,
      batch: b,
      transplanted: v.qty,
      on: v.last,
      match: samePlot && sameBatch ? 'both' : samePlot ? 'this plot' : 'this batch',
    });
  });
  return out.sort((a, b) => a.plot.localeCompare(b.plot, undefined, { numeric: true }) ||
                            a.batch.localeCompare(b.batch, undefined, { numeric: true }));
}

/* The gates, in the same order loadPlots applies them. Kept beside the
   diagnosis rather than inside it so the wording of each answer sits next to
   the rule it reports on. */
function whyNot(d, p, b, q, planted, finished) {
  if (isCancelled(d)) return 'the order is cancelled';
  if (!p) return 'no plot on this line';
  if (!b) return 'no batch on this line — the calculator cannot tell the plot’s batches apart without one';
  if (!q) return 'no quantity on this line';
  if (isReplantPlot(p)) return 'a -R plot, which does not belong on this screen';
  if (isOldBatch(b)) return `batch ${b} is before ${MIN_BATCH}`;
  const key = `${p}#${b}`;
  if (!planted.has(key)) return `the batch report has no batch ${b} transplanted into ${p}`;
  if (finished.has(key)) return 'the 3rd culling map qty is in — this block is done';
  return 'LISTED';
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

/** → Set of "PLOT#BATCH" the 3rd culling has finished. */
export async function loadFinished() {
  const res = await fetchAllRows(() =>
    supabase
      .from('shared_inventory_logs')
      .select('plot_name, batch_name, remark')
      .eq('transaction_type', '3rd_Culling')
      .order('id', { ascending: true })
  );
  if (res.error) {
    console.warn('[culling] could not read the 3rd culling:', res.error.message);
    return new Set();
  }
  return finishedBlocks(res.data || []);
}

/**
 * The drone MAP QUANTITY is what ends a block.
 *
 * Not the culled figure, and not the row existing. The 3rd Culling Records
 * report opens a row for every plot a batch went into, and a Field Conductor
 * fills the culled quantity in while the work is still going on — so both of
 * those say "being counted", not "counted". The Map qty is the drone's own
 * number, keyed once the map is back and the count is settled, and until it
 * is there the block still has work in it.
 *
 * That is why B4 batch 242 and U17 batches 237 and 242 went missing: they had
 * a culled figure against them and no map quantity yet, and the old rule read
 * the figure as the end of the job.
 *
 * The Batch Report leaves it in the remark — " MapQty: 151", written only
 * when the field was filled — and this reads it back with that page's own
 * expression so the two cannot drift apart.
 */
export function mapQty(remark) {
  const m = /MapQty:\s*(\d+)/.exec(String(remark || ''));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * The same, from rows already in hand.
 *
 * Only 3rd_Culling rows are read. A Cull3_Transfer used to end a block too,
 * on the reasoning that seedlings moved off a plot have left it — but a
 * transfer carries no map quantity, so treating it as the end would take a
 * block off this screen by a route the Map qty rule does not govern. The
 * transfer is the movement; the map quantity on the plot's own culling row is
 * the finish.
 */
export function finishedBlocks(rows) {
  const out = new Set();
  for (const l of rows || []) {
    if (l.transaction_type && l.transaction_type !== '3rd_Culling') continue;
    const batch = batchKey(l.batch_name);
    const plot = plotKey(l.plot_name);
    if (!batch || !plot) continue;
    if (!(mapQty(l.remark) > 0)) continue;
    out.add(`${plot}#${batch}`);
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
