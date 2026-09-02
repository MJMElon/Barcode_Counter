/**
 * The Worker Portal's copy of its own morning, kept on the phone.
 *
 * The portal recorded offline from the day it was built — the outbox saw to
 * that. Two things it could not do:
 *
 *   GET IN.   Every open asked worker_whoami before drawing anything, and a
 *             null answer means "signed out". With no signal that read fails,
 *             the identity stayed null, and the worker was shown the PIN
 *             cover — locked out of their own to-do list while standing in
 *             the plot it lists. A PIN they key again does not help: signing
 *             in is a network call too.
 *
 *   SEE THE   The list, the plan and what has already been done all came
 *   LIST.     straight from the worker_* functions. Offline the screen drew
 *             "Everything on the plan is done. Well done." over an empty
 *             list, which is the same lie the FC board told and worse here,
 *             because this screen IS the instruction.
 *
 * So the last good read is kept, exactly as modules/maintenance/offline.js
 * does for the FC portal — same shape, same rules, for the same reason.
 *
 * ── What is NOT kept ──
 *
 * The PIN, and anything that would let a stolen phone become somebody else.
 * The identity cached here is what the office already told this phone about
 * itself — name, nursery, which switches are on — and it is a SCREEN gate,
 * not the security. Every worker_* function re-checks the token in the
 * database on every call, so a tampered cache can draw a button and still
 * cannot record a thing. The token has always been in localStorage; this
 * adds no key that was not there.
 *
 * ── Kept per worker ──
 *
 * Two workers do share a phone — a supervisor's handset passed round a
 * gang — so everything here is filed under the worker's id and a cache
 * belonging to somebody else is ignored rather than shown. Getting that
 * wrong would put one man's plots in another man's list.
 */

const KEY = 'mjm_worker_offline_v1';

/* Enough to see the period behind you. The office keeps the history, and a
   phone that has been out of coverage for a week does not need a thousand
   rows to know what it has already done. */
const MAX_RECORDS = 300;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw && typeof raw === 'object' ? raw : null;
  } catch (e) {
    return null;
  }
}

function write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    /* Storage full or switched off. The worker still has today's answer;
       they simply will not have it tomorrow. */
  }
}

/** Whose cache this is. Anything filed under somebody else is not ours. */
function mine(raw, workerId) {
  if (!raw) return null;
  if (workerId == null || raw.workerId == null) return raw;
  return String(raw.workerId) === String(workerId) ? raw : null;
}

/* ── Who is holding the phone ─────────────────────────────────────────── */

/** Keep what worker_whoami / worker_signin last said about this worker. */
export function cacheIdentity(identity) {
  if (!identity || !identity.worker) return;
  const id = identity.worker.id;
  const now = read();
  /* A different worker signing in on the same phone starts a clean cache:
     their predecessor's plots and records are none of their business, and
     showing them would be worse than showing nothing. */
  const base = mine(now, id) || {};
  write({ ...base, workerId: id == null ? null : id, identityAt: Date.now(), identity });
}

/**
 * @returns the last identity this phone was given, or null. Used to draw the
 *   portal before the network answers — and INSTEAD of it, when there is no
 *   network to answer.
 */
export function cachedIdentity() {
  const raw = read();
  const hit = raw && raw.identity;
  return hit && hit.worker ? hit : null;
}

/** Signing out must leave nothing behind for the next person. */
export function clearWorkerCache() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* nothing to do about it */ }
}

/* ── The morning's work ───────────────────────────────────────────────── */

export function cacheData(workerId, { plots, records }) {
  const base = mine(read(), workerId) || {};
  write({
    ...base,
    workerId: workerId == null ? null : workerId,
    at: Date.now(),
    plots: plots || [],
    /* Defensive: worker_maint_records does not return the walked track today,
       and must not start being cached if it ever does — a thousand points on
       each of three hundred rows is megabytes, and localStorage gives five in
       total for everything this phone keeps. */
    records: (records || []).slice(0, MAX_RECORDS).map((r) => {
      const out = { ...r };
      delete out.gps_track;
      return out;
    }),
  });
}

export function cachedData(workerId) {
  const raw = mine(read(), workerId);
  if (!raw || !Array.isArray(raw.plots)) return null;
  return { plots: raw.plots, records: raw.records || [], at: Number(raw.at) || 0 };
}

/** The office's plan, filed under the month it is for. */
export function cacheSchedules(workerId, monthLabel, rows) {
  const base = mine(read(), workerId) || {};
  const months = base.months || {};
  months[monthLabel || ''] = { at: Date.now(), rows: rows || [] };
  write({ ...base, workerId: workerId == null ? null : workerId, months });
}

export function cachedSchedules(workerId, monthLabel) {
  const raw = mine(read(), workerId);
  const hit = raw && raw.months && raw.months[monthLabel || ''];
  if (!hit || !Array.isArray(hit.rows)) return null;
  return { rows: hit.rows, at: Number(hit.at) || 0 };
}

/** What is standing in each plot. A Map on the way in and out. */
export function cacheBatches(workerId, map) {
  const base = mine(read(), workerId) || {};
  const flat = [];
  (map || new Map()).forEach((list, plot) => flat.push([plot, list]));
  write({ ...base, workerId: workerId == null ? null : workerId,
          batchesAt: Date.now(), batches: flat });
}

export function cachedBatches(workerId) {
  const raw = mine(read(), workerId);
  if (!raw || !Array.isArray(raw.batches)) return null;
  return { map: new Map(raw.batches), at: Number(raw.batchesAt) || 0 };
}

/** The colleagues a job may be credited to. */
export function cacheRoster(workerId, rows) {
  const base = mine(read(), workerId) || {};
  write({ ...base, workerId: workerId == null ? null : workerId,
          rosterAt: Date.now(), roster: rows || [] });
}

export function cachedRoster(workerId) {
  const raw = mine(read(), workerId);
  if (!raw || !Array.isArray(raw.roster)) return null;
  return { rows: raw.roster, at: Number(raw.rosterAt) || 0 };
}
