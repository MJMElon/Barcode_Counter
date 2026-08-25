import { fetchAllRows, supabase } from '../../lib/supabase.js';
import { keyOf, loadRequests, saveRequests } from './requests.js';

/**
 * Auditor / HQ requests, off the phone and onto the server.
 *
 * This is the one part of PALMS that a single device cannot do at all. A
 * request raised in the Culling Calculator is FOR somebody else — the Site
 * Auditor is asked to re-count a plot, or HQ to rule on a culling rate — and
 * until now it was written to localStorage and seen only by the phone that
 * raised it. The person it was addressed to never got it.
 *
 * Same shape as sync.js: localStorage stays what the screens read and write,
 * and this is the layer either side of it. The Culling Calculator is used
 * standing in a plot, so raising a request must never wait on a network.
 *
 * ONE RULE WORTH KNOWING: the phone never sends `status`.
 *
 * A request's status is the office's answer to it — open, actioned, closed —
 * and the office is the only thing that sets it. If the phone upserted the
 * whole row it would push `open` back over an auditor's `actioned` on every
 * sync, and the work would be asked for again and again. So the push inserts
 * and ignores anything already there, and status only ever travels downwards.
 *
 * Table: shared/create_palms_tables.sql in the mjm-ai-system repo, plus
 * shared/migration_palms_rls.sql, which is what makes the row readable by
 * the office and not by strangers.
 */

const REQS = 'fcportal_palms_requests';

/* The server's natural key, matching the app's own "one per plot per
   destination per day" rule. Conflicting on it rather than on client_uid is
   deliberate: two Field Conductors raising the same plot on the same day
   produce two different uids and one real request, and this is the column
   set that says so. */
const ON_CONFLICT = 'plot_name,send_to,at_date';

const rowOf = (r) => ({
  client_uid: r.uid,
  plot_name: r.plot,
  nursery_name: r.nursery || null,
  purpose: r.purpose || 'Culling',
  send_to: r.to,
  raised_by: r.by || null,
  at_date: r.at,
  details: r.details || null,
  // status is not here on purpose — see the note above.
});

/**
 * Send what this device has raised.
 *
 * ignoreDuplicates leaves a row the server already holds exactly as it is,
 * which is what keeps an actioned request actioned.
 */
export async function pushRequests(list) {
  const rows = (list || loadRequests())
    .filter((r) => r && r.uid && r.plot && r.to && r.at && !r.demo)
    .map(rowOf);
  if (!rows.length) return { sent: 0 };
  const { error } = await supabase
    .from(REQS)
    .upsert(rows, { onConflict: ON_CONFLICT, ignoreDuplicates: true });
  if (error) throw error;
  return { sent: rows.length };
}

/**
 * Bring the server's requests down.
 *
 * Two things arrive that the phone cannot know on its own: requests raised
 * from somebody else's device, and what the office has since done with them.
 * A local request the server has not got yet is left alone — the next push
 * sends it — so a request keyed in with no signal is never lost to a pull.
 */
export async function pullRequests() {
  const { data, error } = await fetchAllRows(() => supabase
    .from(REQS)
    .select('client_uid, plot_name, nursery_name, purpose, send_to, raised_by, at_date, details, status, actioned_by, actioned_at')
    .order('at_date', { ascending: false }));
  if (error) throw error;

  const local = loadRequests();
  const byKey = new Map(local.map((r) => [keyOf(r), r]));

  let added = 0;
  let updated = 0;
  for (const s of data || []) {
    const row = {
      id: s.client_uid || `${s.plot_name}-${s.send_to}-${s.at_date}`,
      uid: s.client_uid || undefined,
      plot: s.plot_name,
      nursery: s.nursery_name || undefined,
      purpose: s.purpose || 'Culling',
      to: s.send_to,
      by: s.raised_by || undefined,
      at: s.at_date,
      details: s.details || null,
      status: s.status || 'open',
      actionedBy: s.actioned_by || undefined,
      actionedAt: s.actioned_at || undefined,
    };
    const have = byKey.get(keyOf(row));
    if (!have) {
      local.push(row);
      byKey.set(keyOf(row), row);
      added++;
    } else if (
      (have.status || 'open') !== row.status ||
      (have.actionedBy || undefined) !== row.actionedBy
    ) {
      // The office's answer, and only that. The plot, the date and the
      // figures behind the request are what this device sent up.
      Object.assign(have, {
        status: row.status,
        actionedBy: row.actionedBy,
        actionedAt: row.actionedAt,
      });
      updated++;
    }
  }

  // Newest first, which is the order the Culling Calculator reads them in.
  local.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  saveRequests(local);
  return { list: local, added, updated };
}

/**
 * One round trip. Best effort like the rest of PALMS: a failure here is a
 * request that goes up on the next sync, not an error worth showing anybody.
 * Returns the merged list, or null if the server could not be reached.
 */
export async function syncRequests() {
  try {
    await pushRequests();
    const { list, added, updated } = await pullRequests();
    return { list, added, updated };
  } catch (e) {
    console.warn('[palms] request sync skipped:', (e && e.message) || e);
    return null;
  }
}
