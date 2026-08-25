import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { newUid } from '../../lib/outbox.js';
import { loadDB, nurseryOfPlot, saveDB } from './data.js';

/**
 * PALMS, off the phone and onto the server.
 *
 * PALMS was written as a single-device app: every activity, every day's
 * report and every setting lived in localStorage under palms_status_v8 and
 * was seen by exactly one browser. That is fine for one person on one phone
 * and wrong for everything else — the office cannot see a plot's activity at
 * all, a Field Conductor's second phone starts from nothing, and a wiped
 * device takes its year of records with it.
 *
 * This file does NOT rewrite PALMS. The screens read and write localStorage
 * synchronously and there is no version of "make it all async" that is a safe
 * change to a working field app. Instead localStorage stays what the screens
 * talk to, and this is the layer either side of it:
 *
 *   pull()  server rows → merged into the local DB, so a new device and the
 *           office see the same plots
 *   push()  local rows the server has not got → up, keyed by client_uid so a
 *           row sent twice lands once
 *
 * Everything is best effort. A Field Conductor standing in a plot with no
 * signal must still be able to key the day in; the sync catches up later, and
 * nothing here ever refuses or discards a local record.
 *
 * Tables: shared/create_palms_tables.sql in the mjm-ai-system repo.
 */

const LOGS = 'fcportal_palms_plot_logs';
const HISTORY = 'fcportal_palms_history';

/* A unit key is the plot while it is whole ("B2") and "B2#A" once it is split
   into areas. The server keeps the whole key in plot_name — an area IS the
   unit work is logged against, and splitting it out into its own column would
   make every read reassemble it. */
const nurseryOf = (unitKey) => nurseryOfPlot(String(unitKey).split('#')[0]);

/** Rows are matched on client_uid, so every local entry needs one before it
    can be sent. Entries predate this field; they are stamped on first sync
    and the stamp is saved, so the id survives into every later push. */
function ensureUids(db) {
  let added = 0;
  Object.keys(db.logs || {}).forEach((key) => {
    (db.logs[key] || []).forEach((e) => {
      if (!e.uid) { e.uid = newUid(); added++; }
    });
  });
  return added;
}

const rowOf = (unitKey, e) => ({
  client_uid: e.uid,
  nursery_name: nurseryOf(unitKey),
  plot_name: unitKey,
  act_n: e.actN,
  start_date: e.start,
  end_date: e.end || null,
  ideal_days: e.ideal == null ? null : e.ideal,
  recorded_by: e.by || null,
  seq_no: e.no == null ? null : e.no,
  updated_at: new Date().toISOString(),
});

/**
 * Send everything local to the server.
 *
 * upsert on client_uid rather than insert: an entry that has been closed
 * (end_date filled in) or re-dated since the last push is the SAME entry, and
 * the server should end up holding what the phone holds. A first push of a
 * device with a year of history is one statement, not a year of them.
 */
export async function push(db) {
  const rows = [];
  Object.keys(db.logs || {}).forEach((key) => {
    // e.demo is the sample data a fresh install seeds itself with. It exists
    // so an empty phone has something to look at; sending it would show the
    // office 52 plots of activity that never happened.
    (db.logs[key] || []).forEach((e) => { if (e.uid && !e.demo) rows.push(rowOf(key, e)); });
  });
  if (rows.length) {
    const { error } = await supabase.from(LOGS).upsert(rows, { onConflict: 'client_uid' });
    if (error) throw error;
  }

  // The daily report: one row per unit per day, so a nursery saved twice in
  // an afternoon is a correction rather than a second report.
  // Same two rules as the entries: nothing generated, and nothing for a unit
  // whose entries were all generated. A demo plot that later took a real
  // entry must still not carry its invented days up with it.
  const sentKeys = new Set(rows.map((r) => r.plot_name));
  const hist = (db.history || [])
    .filter((h) => h && h.key && h.at && !h.demo && sentKeys.has(h.key))
    .map((h) => ({
      unit_key: h.key,
      at_date: h.at,
      acts: h.acts || [],
      recorded_by: h.by || null,
      updated_at: new Date().toISOString(),
    }));
  if (hist.length) {
    const { error } = await supabase.from(HISTORY).upsert(hist, { onConflict: 'unit_key,at_date' });
    if (error) throw error;
  }
  return { logs: rows.length, history: hist.length };
}

/**
 * Bring the server's rows into the local DB.
 *
 * The merge is per ENTRY, not per plot: two Field Conductors working
 * different plots — or the same plot on different days — must not overwrite
 * each other, which is exactly what saving one blob per device would do.
 * A local entry the server has not got is left alone (push sends it next);
 * a server entry the phone has not got is added; one both hold takes the
 * server's dates, because that is the copy everyone else is reading.
 */
export async function pull(db) {
  const { data, error } = await fetchAllRows(() => supabase
    .from(LOGS)
    .select('client_uid, plot_name, act_n, start_date, end_date, ideal_days, recorded_by, seq_no')
    .order('id', { ascending: true }));
  if (error) throw error;

  const byUid = new Map();
  Object.keys(db.logs || {}).forEach((key) =>
    (db.logs[key] || []).forEach((e) => { if (e.uid) byUid.set(e.uid, { key, e }); })
  );

  let added = 0;
  let updated = 0;
  for (const r of data || []) {
    const entry = {
      uid: r.client_uid,
      no: r.seq_no == null ? ++db.seq : r.seq_no,
      actN: r.act_n,
      start: r.start_date,
      end: r.end_date || null,
      ideal: r.ideal_days == null ? undefined : r.ideal_days,
      by: r.recorded_by || undefined,
    };
    const have = byUid.get(r.client_uid);
    if (!have) {
      db.logs[r.plot_name] = db.logs[r.plot_name] || [];
      db.logs[r.plot_name].push(entry);
      added++;
      // Keep the device's counter ahead of anything it has just been handed,
      // or the next entry keyed in here reuses a number already in use.
      if (entry.no > (db.seq || 0)) db.seq = entry.no;
    } else if (have.e.start !== entry.start || (have.e.end || null) !== entry.end) {
      Object.assign(have.e, { start: entry.start, end: entry.end });
      updated++;
    }
  }

  // Each unit's entries back into the order every screen reads them in.
  Object.keys(db.logs).forEach((k) =>
    db.logs[k].sort((a, b) => String(a.start).localeCompare(String(b.start)) || (a.no || 0) - (b.no || 0))
  );

  const hist = await fetchAllRows(() => supabase
    .from(HISTORY).select('unit_key, at_date, acts, recorded_by').order('at_date', { ascending: true }));
  if (!hist.error) {
    db.history = db.history || [];
    for (const h of hist.data || []) {
      const row = { at: h.at_date, key: h.unit_key, acts: h.acts || [], by: h.recorded_by || undefined };
      const i = db.history.findIndex((x) => x.key === row.key && x.at === row.at);
      if (i >= 0) db.history[i] = row;
      else db.history.push(row);
    }
  }
  return { added, updated };
}

/**
 * One round trip: stamp anything unstamped, send it, then take what came
 * back. Saves the merged DB and returns what moved, or null if the server
 * could not be reached — which is not an error worth showing anybody.
 *
 * Pass the DB the screens are holding. It is mutated in place, so the module
 * redraws against the merged result instead of the copy it loaded before the
 * sync ran; without that, rows pulled down only appear on the next reload.
 */
export async function syncPalms(target) {
  const db = target || loadDB();
  try {
    if (ensureUids(db)) saveDB(db);
    const sent = await push(db);
    const got = await pull(db);
    saveDB(db);
    return { ...sent, ...got };
  } catch (e) {
    console.warn('[palms] sync skipped:', (e && e.message) || e);
    return null;
  }
}
