/**
 * Who may see what in the FC Scan Portal.
 *
 * One definition, imported by every module and by the dashboard. The nursery
 * rule used to be written out twice — once in plotstatus/helpers.js and once
 * in maintenance/helpers.js — which is exactly how two copies of a rule drift
 * apart and one screen quietly stops matching the other.
 *
 * All of it is set on the main portal: FC Scan Portal → User Access, saved to
 * shared_profiles.permissions.
 *
 * No imports here, so it stays unit-testable in plain node.
 */

/**
 * Which nurseries may this user see?
 *  - permissions.plot_status_nurseries absent/null → null, meaning ALL
 *  - array → exactly those (an empty array means none)
 *
 * One setting governs both Plot Status and Maintenance, which is how the
 * User Access screen presents it.
 */
export function allowedNurseries(permissions) {
  const v = permissions && permissions.plot_status_nurseries;
  return Array.isArray(v) ? v : null;
}

/** True when this user is restricted to a subset rather than everything. */
export function isNurseryScoped(permissions) {
  return allowedNurseries(permissions) !== null;
}

/**
 * Can this user do `action` on `page` of the Scan Portal?
 * Stored as permissions.scan_actions.<page> = { view, …actions }.
 *
 * Fails OPEN when nothing has been set for the user. These modules have always
 * been governed by simply having the Scan module, and someone who has never
 * been through the User Access screen must not lose work they could do
 * yesterday. Turning a page off is therefore a deliberate act, never a default.
 */
export function canScan(permissions, page, action) {
  const acts = permissions && permissions.scan_actions && permissions.scan_actions[page];
  if (!acts) return true;
  if (!acts.view) return false;          // page closed → every function closed
  if (action === 'view') return true;
  return !!acts[action];
}

export const canMaintain  = (permissions, action) => canScan(permissions, 'maintenance', action);
export const canPlotStatus = (permissions, action) => canScan(permissions, 'plot_status', action);
