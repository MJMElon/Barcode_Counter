// Data layer for the Maintenance module. Pure helpers live in helpers.js
// (no imports there, so they stay unit-testable in plain node).

import { dataUrlToBlob } from '../../lib/image.js';
import { PERMANENT, flushOutbox, isOnline, listJobs, looksOffline, queueJob } from '../../lib/outbox.js';
import { fetchAllRows, supabase } from '../../lib/supabase.js';
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
export { isModuleAdmin, nurseryKey } from '../../lib/access.js';

/** Raised when the table has not been created yet, so the UI can say which
    SQL to run instead of showing a raw PostgREST error. */
export const SETUP_NEEDED = 'SETUP_NEEDED';

/** Raised when the batch/week columns have not been added yet. */
export const BATCH_SETUP_NEEDED = 'BATCH_SETUP_NEEDED';

/** Raised when the verify/reject columns have not been added yet. */
export const VERIFY_SETUP_NEEDED = 'VERIFY_SETUP_NEEDED';

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

/**
 * Photos of the work, into the shared `documents` bucket.
 *
 * They arrive already shrunk (see lib/image.js) — a phone hands over several
 * megabytes and what is kept is a couple of hundred kilobytes. Object storage
 * rather than a column in the database: these are files, and the database has
 * a disk to protect.
 *
 * Best effort per photo. One that will not upload is left out rather than
 * losing the record it belongs to — a Field Conductor should not be made to
 * key the job again because the signal dropped on a picture.
 */
export async function uploadMaintPhotos(dataUrls, { plot, workTypeKey, date }) {
  const urls = [];
  for (let i = 0; i < (dataUrls || []).length; i++) {
    try {
      const safe = (s) => String(s || '').replace(/[^0-9A-Za-z_-]+/g, '_');
      const path = `maint_photos/${safe(date)}/${safe(plot)}_${safe(workTypeKey)}_${Date.now()}_${i}.jpg`;
      const { error } = await supabase.storage
        .from('documents')
        .upload(path, dataUrlToBlob(dataUrls[i]), { contentType: 'image/jpeg', upsert: true });
      if (error) { console.warn('[maintenance] photo upload failed:', error.message); continue; }
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      if (data && data.publicUrl) urls.push(data.publicUrl);
    } catch (e) {
      console.warn('[maintenance] photo upload failed:', e);
    }
  }
  return urls;
}

/**
 * A queued record, in the shape of the database row it is going to become.
 *
 * The work HAS been done — only the upload is outstanding — so anything
 * counting or listing work has to see it, or a Field Conductor offline is
 * told a plot is still due and does it twice.
 */
export function queuedAsRecord(job) {
  const a = (job && job.payload) || {};
  return {
    // A queued EDIT keeps the id of the row it is changing, so it stands in
    // place of that row rather than appearing beside it as a second copy.
    id: a.id != null ? a.id : 'pending:' + (job && job.uid),
    _pendingEdit: a.id != null,
    _pending: true,
    work_date: a.date,
    plot_name: a.plot && a.plot.plot_name,
    nursery_name: a.plot && a.plot.nursery_name,
    work_type: a.workTypeKey,
    chemical: a.chemical || null,
    qty: a.qty ?? null,
    remark: a.remark || null,
    reported_by: a.reportedBy || null,
    batch_name: (a.batches || []).join(', '),
    week_no: a.weekNo || null,
    schedule_month: a.scheduleMonth || null,
    photo_urls: (a.photos || []).join(','),
  };
}

/** Saved rows plus whatever the outbox is still holding, edits standing in
    place of the row they change rather than doubling it. */
export function withQueued(records, jobs) {
  const queued = (jobs || []).map(queuedAsRecord);
  const editedIds = new Set(queued.filter((r) => r._pendingEdit).map((r) => r.id));
  return [...queued, ...(records || []).filter((r) => !editedIds.has(r.id))];
}

/* The kind of job the outbox holds for this module. */
export const MAINT_JOB = 'maint_record';

/**
 * Save a record, signal or no signal.
 *
 * Offline it goes straight to the queue; online it is tried and only queued
 * if the attempt failed for a reason a retry could fix. Either way the Field
 * Conductor gets an answer immediately and never loses the work.
 *
 * Returns { queued } so the screen can say which happened.
 */
export async function submitRecord(args) {
  if (!isOnline()) {
    await queueJob(MAINT_JOB, args);
    return { queued: true };
  }
  try {
    await sendRecord(args);
    return { queued: false };
  } catch (e) {
    if (e && e.message === BATCH_SETUP_NEEDED) throw e;   // saved; only columns missing
    if (looksOffline(e)) {
      await queueJob(MAINT_JOB, args);
      return { queued: true };
    }
    throw e;
  }
}

/**
 * Everything a queued record needs doing, in order: the photos up to storage,
 * then the row. Used by submitRecord and, later, by the flush.
 */
export async function sendRecord(args) {
  const { photos, ...rest } = args || {};
  const already  = (photos || []).filter((u) => u && !String(u).startsWith('data:'));
  const fresh    = (photos || []).filter((u) => u && String(u).startsWith('data:'));
  const uploaded = fresh.length
    ? await uploadMaintPhotos(fresh, { plot: rest.plot && rest.plot.plot_name, workTypeKey: rest.workTypeKey, date: rest.date })
    : [];
  await saveRecord({ ...rest, photoUrls: [...already, ...uploaded] });
}

/** Send everything the queue is holding. */
export function flushMaintenance() {
  return flushOutbox({
    [MAINT_JOB]: async (payload, uid) => {
      try {
        await sendRecord({ ...payload, clientUid: uid });
      } catch (e) {
        // A row this uid already wrote — the last flush was cut off between
        // the server taking it and the queue letting go of it.
        if (/duplicate key|already exists|23505/i.test(String((e && e.message) || ''))) return;
        if (looksOffline(e)) throw e;                 // try again later
        throw new Error(PERMANENT);                   // the server refused it
      }
    },
  });
}

/** What is still waiting, so a screen can show it rather than lose it. */
export async function pendingRecords() {
  const jobs = await listJobs();
  return jobs.filter((j) => j.kind === MAINT_JOB);
}

/** Create or update one record. `id` present = update. */
export async function saveRecord({ id, plot, workTypeKey, date, qty, chemical, remark, reportedBy,
                                   batches, weekNo, scheduleMonth, photoUrls, clientUid }) {
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
  if (photoUrls && photoUrls.length) extra.photo_urls = photoUrls.join(',');
  // Written by a queued record so a repeated flush is refused by the unique
  // index rather than saving the same morning's work twice.
  if (clientUid) extra.client_uid = clientUid;

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
 * Has this record been checked, sent back, or neither?
 *
 * Three columns say it — verified_at, rejected_at, and nothing — and exactly
 * one of them is set at a time. See shared/add_maint_field_verify.sql and
 * shared/add_maint_field_reject.sql in the office repository.
 */
export function verifyState(r) {
  if (!r) return 'awaiting';
  if (r.rejected_at) return 'rejected';
  if (r.verified_at) return 'verified';
  return 'awaiting';
}

/** Still waiting for a conductor to look at it. A record on its way up from a
    phone is not in the deck: there is nothing to sign for until it lands. */
export const awaitingVerify = (rows) =>
  (rows || []).filter((r) => !r._pending && verifyState(r) === 'awaiting');

/**
 * True once the database can hold an answer.
 *
 * Read off a row rather than asked of the server: the module already has the
 * records, and a column that exists comes back as a key whether or not it is
 * set. With no records at all there is nothing to verify either way, so the
 * hub is simply empty rather than wrong.
 */
export function hasVerifyColumns(rows) {
  const r = (rows || []).find((x) => x && !x._pending);
  return !!r && 'verified_at' in r && 'rejected_at' in r;
}

/* One write for all three answers, because they are one answer: a record is
   waiting, verified, or sent back, and setting one state means clearing the
   others. Leaving the old columns behind would give a row two answers at
   once, which no screen can read. */
async function writeVerification(id, patch) {
  const { error } = await supabase
    .from('nops_maint_field_records')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    if (isMissingColumn(error)) throw new Error(VERIFY_SETUP_NEEDED);
    throw error;
  }
}

/** Checked, and signed for. */
export function verifyRecord(id, by) {
  return writeVerification(id, {
    verified_by: by || null,
    verified_at: new Date().toISOString(),
    rejected_at: null,
    rejected_by: null,
    reject_reason: null,
  });
}

/**
 * Sent back, with the reason.
 *
 * The row stays and the work may well have been done — what is refused is the
 * RECORD of it. The FC Portal stops counting a rejected record towards the
 * week, so the plot goes back on the list as still outstanding, which is the
 * whole point of the button.
 */
export function rejectRecord(id, by, reason) {
  return writeVerification(id, {
    rejected_by: by || null,
    rejected_at: new Date().toISOString(),
    reject_reason: reason || null,
    verified_by: null,
    verified_at: null,
  });
}

/** Back to waiting — what the undo banner presses. */
export function clearVerification(id) {
  return writeVerification(id, {
    verified_by: null, verified_at: null,
    rejected_by: null, rejected_at: null, reject_reason: null,
  });
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
  const view = await fetchAllRows(() => supabase
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
  if (logsRes.error) throw logsRes.error;
  return batchesByPlot(logsRes.data || [], (dosRes && dosRes.data) || []);
}

export async function deleteRecord(id) {
  const { error } = await supabase.from('nops_maint_field_records').delete().eq('id', id);
  if (error) throw error;
}
