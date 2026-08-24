// Requests raised for the Site Auditor from the Culling Calculator.
//
// Stored on the device, like the rest of PALMS. That means the auditor sees
// them when they open the portal on THIS device; delivering them to another
// person's phone needs a shared backend (Supabase), which is the natural next
// step once the flow is agreed.

const KEY = 'palms_auditor_requests_v1';

export const PURPOSE_CULLING = 'Culling';

// Where a request goes. Anything raised in the Culling Calculator is for the
// culling purpose either way; what differs is who has to act on it.
export const TO_AUDITOR = 'auditor';
export const TO_HQ = 'hq';

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

// One request per plot per purpose per day — tapping twice by accident should
// not queue the auditor up with duplicates.
export function addRequest({ plot, nursery, purpose, to, by, at, details }) {
  const list = loadRequests();
  const dup = list.find((r) => r.plot === plot && r.to === to && r.at === at);
  if (dup) return { list, added: false };
  const next = [
    { id: `${plot}-${to}-${at}-${list.length}`, plot, nursery, purpose, to, by, at, details },
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
