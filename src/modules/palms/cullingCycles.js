import { batchKey } from '../maintenance/plotBatches.js';

/**
 * A plot holds more than one intake, and they must never be added together.
 *
 * B4 was transplanted in January and again in June. Both intakes' batches were
 * summed into one balance for the plot, so January's leftovers were being
 * netted off against June's stock — and where January had more recorded
 * leaving than arriving, the whole plot read as minus 725.
 *
 * So the plot is split into INTAKES first, and every figure is worked out
 * inside one:
 *
 *   · transplanting in the same month is one intake
 *   · transplanting in months that run on from each other (June, then July)
 *     is still one intake — a planting that spilled over the month end
 *   · a gap of a whole month or more starts a new intake
 *
 * What has left the plot separates itself, because the ledger records every
 * cull and every delivery order against a BATCH, and a batch belongs to the
 * intake it was transplanted in. Splitting the batches splits the outflow with
 * them; nothing has to guess which intake a sale came from.
 *
 * Selling starts in the seventh to ninth month after transplanting, which is
 * what says which intake is the live one when a plot holds two.
 *
 * No imports beyond the batch key, so this stays testable in plain node.
 */

/** Months of selling: it opens in the 7th month after transplanting and
    should have started by the 9th. */
export const SELL_OPENS = 7;
export const SELL_BY = 9;

/** 'YYYY-MM' from a ledger row, preferring the date the office recorded the
    movement on over the row's own creation time. */
export function monthOf(log) {
  const d = (log && (log.transaction_date || log.created_at)) || '';
  const m = String(d).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
}

/** Months as a single number, so arithmetic on them is arithmetic. */
function ord(m) {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

function fromOrd(n) {
  const y = Math.floor(n / 12);
  const mo = n % 12;
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** How many months from a to b. Same month is 0, the next month is 1. */
export function monthsApart(a, b) {
  return ord(b) - ord(a);
}

export function addMonths(m, n) {
  return fromOrd(ord(m) + n);
}

/**
 * Group months into intakes.
 *
 * Consecutive months stay together — a planting that ran over the month end is
 * one intake, not two. A gap of a whole month or more starts a new one.
 *
 *   ['2026-01', '2026-06']            → [['2026-01'], ['2026-06']]
 *   ['2026-06', '2026-07']            → [['2026-06', '2026-07']]
 *   ['2026-01', '2026-02', '2026-06'] → [['2026-01','2026-02'], ['2026-06']]
 */
export function clusterMonths(months) {
  const sorted = [...new Set((months || []).filter(Boolean))].sort();
  const out = [];
  for (const m of sorted) {
    const last = out.length ? out[out.length - 1] : null;
    if (last && monthsApart(last[last.length - 1], m) <= 1) last.push(m);
    else out.push([m]);
  }
  return out;
}

/** When this intake can be sold from, and when it should have started. */
export function sellWindow(months) {
  const last = months[months.length - 1];
  return { opens: addMonths(last, SELL_OPENS), by: addMonths(last, SELL_BY) };
}

/**
 * One plot's intakes.
 *
 * @param transplantLogs  the plot's Transplanted / _Premium / _DoubleTone rows
 * @param balanceRows     the plot's rows from shared_plot_batch_balance
 * @param nowMonth        'YYYY-MM', for deciding which intake is selling
 *
 * Batches standing in the plot that were never transplanted into it — a
 * hand-corrected stock line, or a batch spelt differently on the way in — have
 * no intake to belong to. They are gathered into one entry with no transplant
 * figure rather than being shared out among the real intakes, because a
 * balance with nothing behind it must not move an intake's rate.
 */
export function cyclesForPlot(transplantLogs, balanceRows, nowMonth) {
  // batch → { qty transplanted in, months it came in }
  const inBy = new Map();
  for (const l of transplantLogs || []) {
    const bk = batchKey(l.batch_name);
    const m = monthOf(l);
    if (!bk || !m) continue;
    if (!inBy.has(bk)) inBy.set(bk, { qty: 0, months: [] });
    const e = inBy.get(bk);
    e.qty += Math.abs(Number(l.quantity_change || 0));
    e.months.push(m);
  }
  inBy.forEach((e) => e.months.sort());

  const clusters = clusterMonths([...inBy.values()].flatMap((e) => e.months));

  // Each batch joins the intake its FIRST transplant month falls in.
  const indexOfMonth = new Map();
  clusters.forEach((c, i) => c.forEach((m) => indexOfMonth.set(m, i)));

  const cycles = clusters.map((months) => ({
    months,
    batches: [],
    transplant: 0,
    balance: 0,
    ...sellWindow(months),
  }));
  const orphan = { months: [], batches: [], transplant: 0, balance: 0, opens: '', by: '' };

  inBy.forEach((e, bk) => {
    const c = cycles[indexOfMonth.get(e.months[0])];
    c.batches.push(bk);
    c.transplant += e.qty;
  });

  for (const r of balanceRows || []) {
    const bk = r.batch_key || batchKey(r.batch_name);
    if (!bk) continue;
    const c = cycles.find((x) => x.batches.includes(bk)) || orphan;
    if (c === orphan && !orphan.batches.includes(bk)) orphan.batches.push(bk);
    c.balance += Number(r.qty || 0);
  }

  const out = cycles.map((c) => ({
    ...c,
    key: c.months[0],
    label: c.months.length > 1 ? `${c.months[0]}…${c.months[c.months.length - 1]}` : c.months[0],
    selling: !!nowMonth && monthsApart(c.months[c.months.length - 1], nowMonth) >= SELL_OPENS,
  }));
  if (orphan.batches.length) {
    out.push({ ...orphan, key: 'unattributed', label: '', selling: false });
  }
  return out;
}

/**
 * The intake the calculator should be counting.
 *
 * The one that is selling — that is what a collection is taking from. Where
 * more than one qualifies it is the most recent, and where none does it is
 * still the most recent, so a plot is never blank just because its stock is
 * young. An entry with no intake behind it is never chosen: there is no rate
 * to be had from it.
 */
export function currentCycle(cycles) {
  const real = (cycles || []).filter((c) => c.transplant > 0);
  if (!real.length) return null;
  const selling = real.filter((c) => c.selling);
  const pool = selling.length ? selling : real;
  return pool.reduce((a, b) => (a.key > b.key ? a : b));
}
