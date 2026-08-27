/*
 * The Maintenance board's data, for somebody signed in with a PIN.
 *
 * It answers the same questions modules/maintenance/data.js answers, in the
 * same shapes, so the FC Portal's Maintenance module renders unchanged for a
 * worker — the same week card, the same month timeline, the same ticks. What
 * differs is underneath: a worker is `anon` and cannot read shared_plots,
 * nops_maint_field_records or nops_maint_state at all, so every question goes
 * to a worker_* database function which checks the token and the boundary
 * before it answers.
 *
 * Two things are deliberately NOT the same:
 *
 *   deleteRecord  refuses. Correcting a record already made is the office's
 *                 job, not the job of whoever happens to be holding a phone.
 *                 The module hides the control too, but a screen that hides a
 *                 button is not the same as a thing that cannot be done.
 *
 *   photos        no upload path exists for anon (the documents bucket takes
 *                 uploads from `authenticated` only), so any that arrive are
 *                 dropped rather than silently lost at the last moment.
 */

import { PERMANENT, flushOutbox, isOnline, listJobs, looksOffline, queueJob } from '../lib/outbox.js';
import { sortRecords, workTypeByKey } from '../modules/maintenance/helpers.js';
import { batchKey, plotKey } from '../modules/maintenance/plotBatches.js';
import { applicableSchedules } from '../modules/maintenance/schedule.js';
import * as api from './workerApi.js';

/* Its own queue kind, separate from the FC portal's 'maint_record'. The two
   can sit in one browser — a Field Conductor's phone that a worker borrowed —
   and a job queued by one must not be flushed by the other, which would send
   it under the wrong name and against the wrong boundary. */
export const WORKER_MAINT_JOB = 'worker_maint_record';

/** The record shape the module expects, from what the RPC returns. */
function asRecords(rows) {
  return sortRecords(rows || []);
}

/** batchMap: plot key → [{ batch, qty }], newest batch number last. */
function asBatchMap(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const pk = plotKey(r.plot_name);
    if (!pk) continue;
    if (!out.has(pk)) out.set(pk, []);
    out.get(pk).push({ batch: r.batch_name, qty: Number(r.qty || 0) });
  }
  out.forEach((list) => list.sort(
    (a, b) => (parseInt(batchKey(a.batch), 10) || 0) - (parseInt(batchKey(b.batch), 10) || 0)
  ));
  return out;
}

/** What the phone actually sends when a job is recorded. */
function payloadOf(args) {
  const { plot, workTypeKey, date, qty, chemical, remark, batches, weekNo, scheduleMonth,
          gps } = args || {};
  const wt = workTypeByKey(workTypeKey);
  return {
    plot_name:  plot && plot.plot_name,
    work_type:  workTypeKey,
    jenis:      wt ? wt.jenis : null,
    work_date:  date,
    qty:        qty === '' || qty == null ? null : qty,
    chemical:   chemical || null,
    remark:     remark || null,
    batch_name: batches && batches.length ? batches.join(', ') : null,
    week_no:    weekNo || null,
    schedule_month: scheduleMonth || null,
    // Where the phone was, when the GPS switch is on for this worker. The
    // function writes it only if the columns are there, so a database part
    // way through the migrations still records the job.
    gps_lat:      (gps && gps.lat) ?? null,
    gps_lng:      (gps && gps.lng) ?? null,
    gps_accuracy: (gps && gps.accuracy) ?? null,
  };
}

export function makeWorkerMaintSource(token) {
  async function send(args) {
    await api.submitMaintenance(token, payloadOf(args));
  }

  return {
    async loadData() {
      const [plots, records] = await Promise.all([
        api.plots(token),
        api.maintRecords(token, 500),
      ]);
      return { plots: plots || [], records: asRecords(records) };
    },

    async loadPlotBatches() {
      try {
        return asBatchMap(await api.plotBatches(token));
      } catch (e) {
        // The office's balance view may not exist yet. The board copes with
        // no batches; it must not fail to open over it.
        console.warn('[worker-maint] batches unavailable:', e && e.message);
        return new Map();
      }
    },

    /* The module asks for named nurseries and a month. Which nurseries is
       already decided by the boundary, so that argument is ignored here — but
       the month is not, and neither is what has to happen to the rows before
       the board can read them.

       applicableSchedules is the same step data.js takes on the FC side: it
       picks the plan that applies (the office carries a plan forward without
       writing a row, so the newest month at or before this one wins) and
       migrates payloads saved under the older manuring/inter-row shape.
       Returning the raw rows instead left every week chip empty, because the
       board was handed a shape it does not read. */
    async loadSchedules(_keys, monthLabel) {
      try {
        return applicableSchedules(await api.schedules(token), monthLabel);
      } catch (e) {
        console.warn('[worker-maint] schedules unavailable:', e && e.message);
        return [];
      }
    },

    /* Offline goes straight to the queue; online is tried and only queued if
       the attempt failed for a reason a retry could fix. A worker in a plot
       with no signal gets an answer immediately and never loses the morning.

       A refusal — outside your boundary, module switched off — is NOT such a
       reason, and is raised so the worker is told now rather than finding out
       nothing was ever recorded. */
    async submitRecord(args) {
      if ((args.photos || []).length) {
        console.warn('[worker-maint] photos are not offered to a PIN sign-in; dropping');
      }
      if (!isOnline()) {
        await queueJob(WORKER_MAINT_JOB, payloadOf(args));
        return { queued: true };
      }
      try {
        await send(args);
        return { queued: false };
      } catch (e) {
        if (looksOffline(e)) {
          await queueJob(WORKER_MAINT_JOB, payloadOf(args));
          return { queued: true };
        }
        throw e;
      }
    },

    /* No roster. The tick list exists so a conductor can key a job for
       somebody whose phone is broken; a worker signing in with their own PIN
       has already answered the question, and handing them a list of
       colleagues to credit work to would be handing them a way to credit it
       to the wrong person. The module offers it only when a source has one. */
    loadWorkers: null,

    deleteRecord() {
      return Promise.reject(new Error('Only the office can remove a record.'));
    },

    flushQueue() {
      return flushOutbox({
        [WORKER_MAINT_JOB]: async (payload) => {
          try {
            await api.submitMaintenance(token, payload);
          } catch (e) {
            if (looksOffline(e)) throw e;          // try again later
            throw new Error(PERMANENT);            // the database refused it
          }
        },
      });
    },

    async pending() {
      const jobs = await listJobs();
      return jobs.filter((j) => j.kind === WORKER_MAINT_JOB);
    },
  };
}

/* What the module's access checks should conclude about a worker.
 *
 * Built here rather than special-casing lib/access.js: the rules there are
 * the rules, and a worker's boundary is just another way of arriving at the
 * same two answers — which nurseries, and which actions.
 *
 *   record   yes, that is the whole point of the portal — unless a supervisor
 *            has switched it off in the Worker Portal's Settings
 *   edit     no — and isModuleAdmin stays false, which is what the module
 *            actually gates deleting on
 *   export   no; a worker does not need the nursery's month as a spreadsheet
 *
 * `actions` is the worker's own row of switches — portal.actions.maintenance,
 * set per worker in Settings, the same keys the office sets per Field
 * Conductor. It goes in LAST so a supervisor's answer wins, and anything not
 * set there is left absent so functions.js can apply the documented default
 * rather than this file inventing a second one.
 *
 * Two of those keys can never be honoured here and are forced off: a PIN
 * sign-in is `anon`, which has no upload path for a photo and is deliberately
 * never handed the roster. The Settings screen says so beside them.
 */
export function workerPermissions(boundary, actions) {
  const nurseries = boundary && boundary.nurseries;
  const a = (actions && actions.maintenance) || {};
  return {
    manage_users: false,
    modules: {},
    scan_nurseries: Array.isArray(nurseries) ? { maintenance: nurseries } : {},
    scan_actions: {
      maintenance: {
        ...a,
        view: true,
        record: a.record === false ? false : true,
        edit: false,
        export: false,
        workers: false,
        photos: false,
      },
    },
  };
}

/* The plot half of a boundary, as a predicate. null means every plot in the
   allowed nurseries, which is what most workers have. */
export function workerPlotFilter(boundary) {
  const plots = boundary && boundary.plots;
  if (!Array.isArray(plots)) return null;
  const keys = new Set(plots.map((n) => plotKey(n)));
  return (plotName) => keys.has(plotKey(plotName));
}
