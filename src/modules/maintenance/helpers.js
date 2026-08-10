// Pure helpers for the Maintenance module — no imports, so they can be
// unit-tested in plain node and reused anywhere.

/**
 * The four maintenance jobs. `jenis` is the exact wording Nursery Operation
 * Management stores in its own Work Maintenance list, so a job recorded in the
 * field lines up with the office record instead of being a near-miss spelling
 * of it. Do not "tidy" these strings.
 */
export const WORK_TYPES = [
  { key: 'pd',       icon: '🧪', jenis: 'Penyemburan racun kulat dan serangga', en: 'P & D Spraying',     ms: 'Penyemburan Racun Kulat & Serangga' },
  { key: 'manuring', icon: '🌾', jenis: 'Membaja',                              en: 'Manuring',           ms: 'Membaja' },
  { key: 'weeding',  icon: '🌿', jenis: 'Merumput',                             en: 'Weeding',            ms: 'Merumput' },
  { key: 'interrow', icon: '💨', jenis: 'Meracun rumput secara selingan',       en: 'Interrow Spraying',  ms: 'Meracun Rumput Selingan' },
];

export const workTypeLabel = (wt, lang) => (wt ? (lang === 'ms' ? wt.ms : wt.en) : '');
export const workTypeByKey = (key) => WORK_TYPES.find((w) => w.key === key) || null;

export const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Which nurseries may this user see? Same rule the Plot Status module uses, so
 * one setting governs both.
 *  - permissions.plot_status_nurseries absent/null → null (= ALL nurseries)
 *  - array → exactly those (possibly empty = none)
 */
export function allowedNurseries(permissions) {
  const v = permissions && permissions.plot_status_nurseries;
  return Array.isArray(v) ? v : null;
}

/**
 * Can this user do `action` on the Scan Portal's Maintenance page?
 * Set on the main portal's FC Scan Portal → User Access, stored as
 * permissions.scan_actions.maintenance.
 *
 * Fails OPEN when nothing has been set for the user: this module has always
 * been governed by having the Scan module at all, and somebody who has never
 * been through the new screen must not lose work they could do yesterday.
 */
export function canMaintain(permissions, action) {
  const acts = permissions && permissions.scan_actions && permissions.scan_actions.maintenance;
  if (!acts) return true;
  if (!acts.view) return false;            // page closed → every function closed
  if (action === 'view') return true;
  return !!acts[action];
}

/** Newest first, then by plot so a day's work reads in a stable order. */
export function sortRecords(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      String(b.work_date || '').localeCompare(String(a.work_date || '')) ||
      String(a.plot_name || '').localeCompare(String(b.plot_name || '')) ||
      (b.id || 0) - (a.id || 0)
  );
}

/** Records as CSV. Quotes every field, so a remark with a comma survives. */
export function toCsv(rows, lang) {
  const head = ['Date', 'Nursery', 'Plot', 'Work', 'Chemical', 'Quantity', 'Remark', 'Recorded by'];
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(',')];
  for (const r of rows || []) {
    lines.push(
      [
        r.work_date,
        r.nursery_name,
        r.plot_name,
        workTypeLabel(workTypeByKey(r.work_type), lang) || r.jenis,
        r.chemical,
        r.qty,
        r.remark,
        r.reported_by,
      ]
        .map(cell)
        .join(',')
    );
  }
  return lines.join('\n');
}
