/**
 * The company's master switches, and how they meet a person's own permission.
 *
 * There are two layers, and they answer different questions:
 *
 *   Worker Portal Manage → System Setting → Portal View & Function
 *       does this company do this at all?     (shared_portal_settings)
 *
 *   Worker Portal Manage → Setting → a person → Edit Access
 *   Worker Portal → Settings → a worker
 *       may THIS person do it?                (their own permissions)
 *
 * OFF BEATS ON. A master switch can only ever take something away — it is a
 * veto, not a grant. Switching Maintenance on for the company does not hand it
 * to anybody who was not already given it; switching it off takes it from
 * everybody, whatever their own row says. That is the whole point of having
 * the switch, and it is why every function below only ever writes `false`.
 *
 * ABSENT MEANS NO VETO. A module or function the company has never touched is
 * simply not being vetoed, so the person's own permission decides. New
 * functions therefore ship working rather than invisible until somebody
 * remembers this screen — the same rule the panel already uses for modules.
 *
 * No imports, so it stays testable in plain node.
 */

/**
 * The portal panel names its modules the way the portal's menu does; the
 * permissions name them the way canScan() does. One of them differs, and a
 * mapping that quietly missed it would leave the Scan switch doing nothing at
 * all — which looks exactly like the feature being broken.
 */
export const MODULE_TO_PAGE = {
  scan: 'barcode',
  do: 'do',
  maintenance: 'maintenance',
  palms: 'palms',
  culling: 'culling',
  // `dashboard` is the portal's own home screen, not a page with permissions
  // behind it. It is switched off by the app, not by narrowing an access row.
};

/** Is a module vetoed by the company? Only an explicit `false` counts. */
export function moduleVetoed(company, moduleKey) {
  const mods = (company && company.modules) || {};
  return mods[moduleKey] === false;
}

/** Is one function inside a module vetoed? Again, only an explicit `false`. */
export function functionVetoed(company, moduleKey, fnKey) {
  const acts = ((company && company.actions) || {})[moduleKey] || {};
  return acts[fnKey] === false;
}

/**
 * Where the veto is kept on a permissions object once it has been applied.
 * Read by canScan() and canMaintFn(), written only by the function below.
 */
export const VETO_KEY = '_companyVeto';

/**
 * A person's permissions, with the company's vetoes attached.
 *
 * Returns a NEW object; the original is untouched, because the same
 * permissions object is what the rest of the app reads and a screen that
 * quietly edited it would be changing what every other screen sees.
 *
 * ── Why the veto is kept BESIDE the permissions and not folded into them ──
 *
 * The obvious thing is to write `{ gps: false }` into scan_actions and let the
 * existing checks do the rest. It is wrong, and quietly:
 *
 * canScan() fails OPEN on a page with no entry at all — that is deliberate,
 * and it is what lets somebody who has never been through the access screen
 * keep the access they had. But it is all-or-nothing per page: the moment an
 * entry EXISTS, every action not named in it reads as off. So writing a single
 * veto into a page nobody had configured turns "everything allowed" into
 * "nothing allowed", and switching off the remark box for the company would
 * have closed Maintenance outright for every person the office had not yet
 * set up by hand.
 *
 * A veto is not a permission. Modelling it as one is what caused that, so it
 * is kept as what it is: a separate list of things that are off no matter what
 * the permissions say. The permission logic is then untouched and keeps
 * failing open exactly as before.
 */
export function applyCompanySwitches(permissions, company) {
  const p = permissions || {};
  if (!company || (!company.modules && !company.actions)) return p;

  const veto = {};

  Object.keys(MODULE_TO_PAGE).forEach((moduleKey) => {
    const page = MODULE_TO_PAGE[moduleKey];
    const acts = ((company.actions || {})[moduleKey]) || {};
    const vetoedFns = Object.keys(acts).filter((k) => acts[k] === false);
    const vetoedModule = moduleVetoed(company, moduleKey);
    if (!vetoedModule && !vetoedFns.length) return;

    const entry = {};
    // The page itself off closes everything inside it; canScan reads `view`
    // that way already, so one flag says the whole thing.
    if (vetoedModule) entry.view = true;
    vetoedFns.forEach((k) => { entry[k] = true; });
    veto[page] = entry;
  });

  if (!Object.keys(veto).length) return p;
  return { ...p, [VETO_KEY]: veto };
}

/**
 * Is this page or action vetoed by the company?
 *
 * Fails CLOSED on nothing — an absent veto list vetoes nothing — which is the
 * right way round: a switchboard that cannot be read must not lock the
 * building.
 */
export function isVetoed(permissions, page, action) {
  const v = (permissions || {})[VETO_KEY];
  const entry = v && v[page];
  if (!entry) return false;
  if (entry.view) return true;                  // the page is off entirely
  return action ? !!entry[action] : false;
}

/**
 * Which of the portal's own modules are switched off, for hiding a card on a
 * menu rather than for refusing a page. `dashboard` lives here and nowhere
 * else, being the one module with no permissions page behind it.
 */
export function hiddenModules(company) {
  const mods = (company && company.modules) || {};
  return Object.keys(mods).filter((k) => mods[k] === false);
}
