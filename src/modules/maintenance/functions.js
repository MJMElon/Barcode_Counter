/**
 * What "Maintenance" is made of, written down once.
 *
 * The board used to be one tick — you had Maintenance or you did not. It is
 * really two jobs with a form between them: reading the office's plan for the
 * month, and recording a morning's work against it. And the record form itself
 * is five separate things, not all of which every nursery wants keyed.
 *
 * So each of those is its own switch, and this file is the list. It is used in
 * three places and must stay one list:
 *
 *   555 FC Portal → Manage → Setting        (scan/scan_user_access.html)
 *   555 Worker Portal → Settings            (worker/WorkerSettings.jsx)
 *   the board itself                        (MaintenanceModule and its sheets)
 *
 * The office screen lives in the other repository and carries its own copy of
 * the keys and the defaults below. Change one, change the other — the comment
 * there says the same thing back.
 */

import { canScan } from '../../lib/access.js';
import { isVetoed } from '../../lib/portalSettings.js';

/**
 * What each switch means when nobody has said.
 *
 * Everything is ON by default, so this change takes nothing away from anybody:
 * a Field Conductor whose access was saved before these switches existed has
 * no entry for `batches` at all, and reading that as "off" would empty his
 * record form on the morning of the deploy.
 *
 * GPS is the one exception and is OFF unless it is deliberately ticked. It
 * asks the phone for a location — a permission prompt, and a position stored
 * against a person's name — and that is not something to switch on for the
 * whole estate because a new version shipped.
 */
export const MAINT_FUNCTION_DEFAULT = {
  schedule: true,
  batches:  true,
  workers:  true,
  gps:      false,
  photos:   true,
  remark:   true,
};

/**
 * The switches, in the order they are shown, with the record form's five
 * nested underneath it. `label` is an i18n key; the office screen spells its
 * own labels out because that page is English only.
 */
export const MAINT_FUNCTIONS = [
  { key: 'schedule', icon: '📅', label: 'wk.fnSchedule' },
  {
    key: 'record',
    icon: '📝',
    label: 'wk.fnRecord',
    children: [
      { key: 'batches', icon: '🌱', label: 'wk.fnBatches' },
      /* The roster and the camera are the FC Portal's alone: a worker signed
         in with a PIN is `anon`, which has no upload path to the documents
         bucket and is deliberately never handed a list of colleagues to
         credit work to. Shown in the worker's list anyway, greyed, so the two
         screens are visibly the same list rather than two lists to compare. */
      { key: 'workers', icon: '👷', label: 'wk.fnWorkers', fcOnly: true },
      { key: 'gps',     icon: '📍', label: 'wk.fnGps' },
      { key: 'photos',  icon: '📷', label: 'wk.fnPhotos', fcOnly: true },
      { key: 'remark',  icon: '✏️', label: 'wk.fnRemark' },
    ],
  },
];

/**
 * Is this function switched on for this person?
 *
 * `record`, `verify` and `export` are older ticks and keep their own rule —
 * canScan / canMaintain — because changing what an absent one means would
 * change access that is already saved. This answers for the switches above:
 * absent means the documented default, present means what it says.
 *
 * A closed page closes every function inside it, the same way canScan does.
 */
export function canMaintFn(permissions, key) {
  if (!canScan(permissions, 'maintenance', 'view')) return false;
  // The company's master switch, which can only ever say no. canScan checks it
  // too, but only for the page and the action it was asked about — these keys
  // never go through it, so the check has to be here as well.
  if (isVetoed(permissions, 'maintenance', key)) return false;
  const acts = (permissions && permissions.scan_actions && permissions.scan_actions.maintenance) || {};
  const v = acts[key];
  if (v === undefined) return MAINT_FUNCTION_DEFAULT[key] === true;
  return !!v;
}
