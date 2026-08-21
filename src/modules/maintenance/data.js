// Data layer for the Maintenance module. Pure helpers live in helpers.js
// (no imports there, so they stay unit-testable in plain node).

import { supabase } from '../../lib/supabase.js';
import { sortRecords, workTypeByKey } from './helpers.js';
import { batchKey, batchesByPlot, plotKey } from './plotBatches.js';
import { applicableSchedules } from './schedule.js';

export {
  WORK_TYPES,
  allowedNurseries,
  canMaintain,
  sortRecords,
  toCsv,
  todayStr,
  workTypeByKey,
  workTypeLabel,
} from './helpers.js';

/** Raised when the table has not been created yet, so the UI can say which
    SQL to run instead of showing a raw PostgREST error. */
export const SETUP_NEEDED = 'SETUP_NEEDED';

/** Raised when the batch/week columns have not been added yet. */
export const BATCH_SETUP_NEEDED = 'BATCH_SETUP_NEEDED';

function isMissingColumn(error) {
  return /column .* does not exist|Could not find the '.*' column/i.test(
    String((error && error.message) || '')
  );
}

function isMissingTable(error) {
  const m = String((error && error.message) || '');
  return /relation .* does not exist|Could not find the table|schema cache/i.test(m);
}

export async function loadMaintenanceData() {
  const [plotsRes, recRes] = await Promise.all([
    supabase.from('shared_plots').select('nursery_name, plot_name').order('plot_name'),
    // Recent work is all a Field Conductor needs on a phone; the office keeps
    // the full history.
    supabase
      .from('nops_maint_field_records')
      .select('*')
      .order('work_date', { ascending: false })
      .limit(500),
  ]);
  if (plotsRes.error) throw plotsRes.error;
  if (recRes.error) {
    if (isMissingTable(recRes.error)) throw new Error(SETUP_NEEDED);
    throw recRes.error;
  }
  return {
    plots: plotsRes.data || [],
    records: sortRecords(recRes.data || []),
  };
}

/** Create or update one record. `id` present = update. */
export async function saveRecord({ id, plot, workTypeKey, date, qty, chemical, remark, reportedBy,
                                   batches, weekNo, scheduleMonth }) {
  const wt = workTypeByKey(workTypeKey);
  const row = {
    work_date: date,
    nursery_name: (plot && plot.nursery_name) || null,
    plot_name: plot.plot_name,
    work_type: workTypeKey,
    // The office's own wording, stored alongside, so the two systems can be
    // matched up without re-deriving it there.
    jenis: wt ? wt.jenis : null,
    chemical: chemical || null,
    qty: qty === '' || qty == null ? null : Number(qty),
    remark: remark || null,
    reported_by: reportedBy || null,
    updated_at: new Date().toISOString(),
  };
  // Which batches were standing in the plot, and which slot of the schedule
  // the job answers. Sent only when there is something to say, so a record
  // made the old way still saves against a table without these columns.
  const extra = {};
  if (batches && batches.length) extra.batch_name = batches.join(', ');
  if (weekNo) extra.week_no = weekNo;
  if (scheduleMonth) extra.schedule_month = scheduleMonth;

  const run = (payload) => (id
    ? supabase.from('nops_maint_field_records').update(payload).eq('id', id)
    : supabase.from('nops_maint_field_records').insert(payload));

  let { error } = await run({ ...row, ...extra });
  // The columns are added by shared/add_maint_field_batch.sql. Until someone
  // runs it, save the job itself rather than losing a morning's work — and
  // say so, so the SQL actually gets run.
  if (error && Object.keys(extra).length && isMissingColumn(error)) {
    const retry = await run(row);
    if (retry.error) throw retry.error;
    throw new Error(BATCH_SETUP_NEEDED);
  }
  if (error) throw error;
}

/**
 * The office's schedule for a nursery and month, and the batches currently
 * standing in each plot. Both feed the week timeline.
 *
 * A missing schedule is not an error — the office simply has not planned that
 * month yet — so it comes back as null and the timeline says as much.
 */
export async function loadSchedules(nurseryKeys, monthLabel) {
  const keys = (nurseryKeys || []).filter(Boolean);
  if (!keys.length) return [];
  // Every month this nursery has ever had a plan for, not just this one: the
  // office carries a plan forward without writing a row until it is saved, so
  // the applicable month has to be worked out here. There is at most one row
  // per nursery per month, so this stays small.
  const { data, error } = await supabase
    .from('nops_maint_state')
    .select('nursery, month, payload')
    .in('nursery', keys);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return applicableSchedules(data || [], monthLabel);
}

/**
 * Supabase caps one request at 1000 rows. The ledger is far longer than that,
 * and a partial read does not fail — it quietly returns a balance built from
 * whichever movements happened to come back first, which is how the plot's
 * batches came to disagree with the office movement report. Page until the
 * rows run out, the same way that report does.
 */
async function fetchAll(buildQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}

/**
 * What is standing in each plot.
 *
 * Postgres works this out in shared_plot_batch_balance — see
 * shared/create_plot_batch_balance.sql in the office repository. That turns
 * tens of thousands of ledger rows crossing the network into one row per
 * plot·batch, which is the difference between a phone downloading the whole
 * nursery's history and asking a question.
 *
 * Until that view exists the old way still works, so the app is never
 * waiting on a migration to be run.
 */
export async function loadPlotBatches() {
  const view = await fetchAll(() => supabase
    .from('shared_plot_batch_balance')
    .select('plot_key, plot_name, batch_name, qty')
    .order('plot_key', { ascending: true }));
  if (!view.error) return mapFromBalances(view.data || []);
  // Any trouble with the view at all — not created yet, not granted, renamed —
  // falls back to the long way rather than leaving a Field Conductor standing
  // in a plot with no batches to tick. Same figures, just more of them moved.
  console.warn('[maintenance] plot balance view unavailable, reading the ledger:',
    view.error.message);
  return loadPlotBatchesFromLedger();
}

/** The view's rows in the shape the form already expects. */
function mapFromBalances(rows) {
  const out = new Map();
  for (const r of rows) {
    const pk = r.plot_key || plotKey(r.plot_name);
    if (!pk) continue;
    if (!out.has(pk)) out.set(pk, []);
    out.get(pk).push({ batch: r.batch_name, qty: Number(r.qty || 0) });
  }
  // Ordered by batch number, so the list reads against the office movement
  // report row for row.
  out.forEach((list) => list.sort(
    (a, b) => (parseInt(batchKey(a.batch), 10) || 0) - (parseInt(batchKey(b.batch), 10) || 0)
  ));
  return out;
}

/** The whole ledger, added up here. Only for a database without the view. */
async function loadPlotBatchesFromLedger() {
  const [logsRes, dosRes] = await Promise.all([
    fetchAll(() => supabase.from('shared_inventory_logs')
      .select('transaction_type, plot_name, batch_name, quantity_change, remark')
      .in('transaction_type', ['Seeds_Received', 'Planted', 'Transplanted',
        'Transplanted_Premium', 'Transplanted_DoubleTone', 'Damaged_Seeds',
        '1st_Culling', '2nd_Culling', '3rd_Culling', 'Cull3_Transfer'])
      .order('id', { ascending: true })),
    fetchAll(() => supabase.from('shared_do_records')
      .select('status, remark, plot_1, qty_1, batch_1, plot_2, qty_2, batch_2, plot_3, qty_3, batch_3, plot_4, qty_4, batch_4, plot_5, qty_5, batch_5')
      .order('id', { ascending: true }))
      .then((r) => r, () => ({ data: [] })),
  ]);
  if (logsRes.error) throw logsRes.error;
  return batchesByPlot(logsRes.data || [], (dosRes && dosRes.data) || []);
}

export async function deleteRecord(id) {
  const { error } = await supabase.from('nops_maint_field_records').delete().eq('id', id);
  if (error) throw error;
}
