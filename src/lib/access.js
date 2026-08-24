/**
 * Who may see what in the FC Scan Portal.
 *
 * One definition, imported by every module and by the dashboard. The nursery
 * rule used to be written out once per module, which is exactly how two copies
 * of a rule drift apart and one screen quietly stops matching the other.
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
 * One setting governs every nursery-aware screen — Maintenance and PALMS —
 * which is how the User Access screen presents it. The key still carries its
 * original plot_status_ name, from the retired Plot Status module, so that
 * access already saved for people keeps working; renaming it would silently
 * open the portal back up for everyone who had been narrowed down.
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
 * The same nursery is written differently in different places: shared_plots
 * says "UNN 1", PALMS calls it "UNN1". Compare on letters and digits alone so
 * one tick on the User Access screen governs both.
 */
export function nurseryKey(name) {
  return String(name == null ? '' : name).replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** May this user see this nursery, however its name happens to be spelt? */
export function nurseryAllowed(permissions, name) {
  const allowed = allowedNurseries(permissions);
  if (allowed === null) return true;
  const want = nurseryKey(name);
  return allowed.some((n) => nurseryKey(n) === want);
}

/**
 * Narrow a module's own list of nurseries down to the ones this user may see.
 * `labelOf` maps an entry to the name to match on, for lists of keys whose
 * label differs from the key. Returns a new array; the original is untouched.
 */
export function visibleNurseries(permissions, list, labelOf) {
  if (!isNurseryScoped(permissions)) return Array.isArray(list) ? [...list] : [];
  const name = typeof labelOf === 'function' ? labelOf : (x) => x;
  return (list || []).filter((item) => nurseryAllowed(permissions, name(item)));
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

/**
 * An admin of a module, by the same rule the office pages use
 * (shared_access.js `isAdminOf`): permissions.modules.<name> === 'admin', or
 * the account that manages users.
 *
 * Unlike canScan this fails CLOSED. It guards changing or deleting a record
 * somebody has already made, and "no permissions loaded yet" must not read as
 * consent.
 */
export function isModuleAdmin(permissions, moduleName = 'operation') {
  const p = permissions || {};
  if (p.manage_users) return true;
  const lvl = p.modules && p.modules[moduleName];
  return String(lvl || '').toLowerCase() === 'admin';
}

export const canBarcode    = (permissions, action) => canScan(permissions, 'barcode', action);
export const canDo         = (permissions, action) => canScan(permissions, 'do', action);
export const canMaintain   = (permissions, action) => canScan(permissions, 'maintenance', action);
export const canPalms      = (permissions, action) => canScan(permissions, 'palms', action);
