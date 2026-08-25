// Requests raised for the Site Auditor from the Culling Calculator.
//
// The device's copy is still what the screens read and write — the Culling
// Calculator is used standing in a plot, and a request must be raisable with
// no signal. requestsSync.js is the layer either side of it: what is raised
// here goes up on the next sync, and what the office has done with it comes
// back down. See that file for why the phone never sends `status`.

const KEY = 'palms_auditor_requests_v1';

export const PURPOSE_CULLING = 'Culling';

// Where a request goes. Anything raised in the Culling Calculator is for the
// culling purpose either way; what differs is who has to act on it.
export const TO_AUDITOR = 'auditor';
export const TO_HQ = 'hq';

// One per plot per destination per day, on the device and on the server
// alike — fcportal_palms_requests carries the same rule as UNIQUE
// (plot_name, send_to, at_date), so the two agree on what a duplicate is.
export const keyOf = (r) => `${r.plot}|${r.to}|${r.at}`;

export function loadRequests() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

export function saveRequests(list) {
  persist(list);
  return list;
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// One request per plot per purpose per day — tapping twice by accident should
// not queue the auditor up with duplicates.
export function addRequest({ plot, nursery, purpose, to, by, at, details }) {
  const list = loadRequests();
  const dup = list.find((r) => r.plot === plot && r.to === to && r.at === at);
  if (dup) return { list, added: false };
  const next = [
    {
      id: `${plot}-${to}-${at}-${list.length}`,
      // The row's name on the server. Stamped here so a request raised with
      // no signal keeps the same identity when it finally goes up.
      uid: uid(),
      plot,
      nursery,
      purpose,
      to,
      by,
      at,
      details,
      status: 'open',
    },
    ...list,
  ];
  persist(next);
  return { list: next, added: true };
}

// Replace the queue wholesale — used when loading demo data.
export function seedRequests(list) {
  persist(list);
  return list;
}

// Whether this plot has already been sent to this destination today. Keyed on
// the destination as well as the plot: an auditor request must not make the
// plot look as though HQ has been told.
export function sentToday(list, plot, at, to) {
  return list.find((r) => r.plot === plot && r.at === at && r.to === to) || null;
}
