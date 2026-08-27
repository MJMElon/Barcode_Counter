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
 * Which nurseries may this user see, on this page?
 *  - an array → exactly those (an empty array means none)
 *  - null    → ALL
 *
 * Nursery access is set PER PAGE: somebody can do Maintenance in BNN and
 * PALMS in UNN1, because in the field those are different jobs done by
 * different people. It is written by 555 FC Portal → Setting as
 * permissions.scan_nurseries.<page>.
 *
 * Two fallbacks, in order, and both matter:
 *
 *  1. plot_status_nurseries — the single list that governed every screen
 *     before this was per page. Still honoured for anyone whose access has
 *     not been re-saved since, or the change would silently reopen every
 *     nursery for everyone who had been narrowed down. (It carries its
 *     original name from the retired Plot Status module for exactly the same
 *     reason.)
 *  2. null — nothing set anywhere, so no restriction.
 *
 * `page` is optional. Called without one it answers for the whole portal:
 * restricted only where every page agrees, which is what a screen that is not
 * about one page — the floating train's count — should be measuring.
 */
export function allowedNurseries(permissions, page) {
  const p = permissions || {};
  const per = p.scan_nurseries;

  if (per && typeof per === 'object') {
    if (page) {
      if (Array.isArray(per[page])) return per[page];
    } else {
      /* No page named: the union of every page's list, because a person who
         may see UNN1 on ANY page can see UNN1 in this portal. Narrowing to
         the intersection here would hide nurseries they are entitled to. */
      const lists = Object.keys(per).map((k) => per[k]).filter(Array.isArray);
      if (lists.length) return [...new Set(lists.flat())];
    }
  }

  const legacy = p.plot_status_nurseries;
  return Array.isArray(legacy) ? legacy : null;
}

/** True when this user is restricted to a subset rather than everything. */
export function isNurseryScoped(permissions, page) {
  return allowedNurseries(permissions, page) !== null;
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
export function nurseryAllowed(permissions, name, page) {
  const allowed = allowedNurseries(permissions, page);
  if (allowed === null) return true;
  const want = nurseryKey(name);
  return allowed.some((n) => nurseryKey(n) === want);
}

/**
 * Narrow a module's own list of nurseries down to the ones this user may see.
 * `labelOf` maps an entry to the name to match on, for lists of keys whose
 * label differs from the key. Returns a new array; the original is untouched.
 */
export function visibleNurseries(permissions, list, labelOf, page) {
  if (!isNurseryScoped(permissions, page)) return Array.isArray(list) ? [...list] : [];
  const name = typeof labelOf === 'function' ? labelOf : (x) => x;
  return (list || []).filter((item) => nurseryAllowed(permissions, name(item), page));
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
  /* The company's master switch first, and it can only ever say no. Kept
     beside the permissions rather than inside them — see lib/portalSettings.js
     for why folding a veto into scan_actions closes pages nobody meant to
     close. Read inline rather than imported, so this file keeps its promise of
     having no imports and staying testable in plain node. */
  const veto = permissions && permissions._companyVeto && permissions._companyVeto[page];
  if (veto && (veto.view || (action && veto[action]))) return false;

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
/* The Culling Calculator was a tab inside PALMS and is now its own page, so it
   is its own tick. Anyone whose access predates the split has no `culling`
   entry, and canScan fails OPEN on a page nobody has configured — so they keep
   the access they had rather than losing it on a deploy. */
export const canCulling    = (permissions, action) => canScan(permissions, 'culling', action);
