// Pure helpers for the Plot Status module — no imports so they can be
// unit-tested in plain node and reused anywhere.

/**
 * Which nurseries may this user see?
 *  - permissions.plot_status_nurseries absent/null → null (= ALL nurseries)
 *  - array → exactly those nurseries (possibly empty = none)
 * Set on the main portal's User Access, under the Scan / FC Portal module.
 */
export function allowedNurseries(permissions) {
  const v = permissions && permissions.plot_status_nurseries;
  return Array.isArray(v) ? v : null;
}

/**
 * Given a plot's daily entries sorted NEWEST FIRST, work out its current
 * status: the latest stage, when that consecutive stage run started, and
 * how many days it has been in it (inclusive, counted to `today`).
 */
export function currentStatus(entries, today = new Date()) {
  if (!entries || !entries.length) return null;
  const cur = entries[0];
  let since = cur.entry_date;
  for (const e of entries) {
    if (e.stage_name !== cur.stage_name) break;
    since = e.entry_date;
  }
  // Calendar days, inclusive: compare midnights so the time of day never
  // shifts the count.
  const t0 = new Date(today);
  t0.setHours(0, 0, 0, 0);
  const days = Math.max(
    1,
    Math.round((t0 - new Date(since + 'T00:00:00')) / 86400000) + 1
  );
  return {
    stage_id: cur.stage_id,
    stage_name: cur.stage_name,
    since,
    days,
    last_date: cur.entry_date,
    last_by: cur.reported_by || null,
  };
}

/** Group a flat list of entries (any order) into per-plot newest-first lists. */
export function groupEntriesByPlot(rows) {
  const by = {};
  for (const r of rows || []) (by[r.plot_name] = by[r.plot_name] || []).push(r);
  for (const k in by) by[k].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  return by;
}

export const todayStr = () => new Date().toISOString().slice(0, 10);
