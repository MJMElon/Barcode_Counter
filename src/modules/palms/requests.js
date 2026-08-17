// Requests raised for the Site Auditor from the Culling Calculator.
//
// Stored on the device, like the rest of PALMS. That means the auditor sees
// them when they open the portal on THIS device; delivering them to another
// person's phone needs a shared backend (Supabase), which is the natural next
// step once the flow is agreed.

const KEY = 'palms_auditor_requests_v1';

export const PURPOSE_CULLING = 'Culling';

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
export function addRequest({ plot, nursery, purpose, by, at, note }) {
  const list = loadRequests();
  const dup = list.find((r) => r.plot === plot && r.purpose === purpose && r.at === at);
  if (dup) return { list, added: false };
  const next = [{ id: `${plot}-${purpose}-${at}-${list.length}`, plot, nursery, purpose, by, at, note }, ...list];
  persist(next);
  return { list: next, added: true };
}

// Replace the queue wholesale — used when loading demo data.
export function seedRequests(list) {
  persist(list);
  return list;
}

export function requestsForPlot(list, plot) {
  return list.filter((r) => r.plot === plot);
}

// Latest request raised for a plot today, used to show a "sent" marker.
export function sentToday(list, plot, at) {
  return list.find((r) => r.plot === plot && r.at === at) || null;
}
