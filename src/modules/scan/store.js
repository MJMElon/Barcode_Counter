// Local persistence for the scan counter. Offline-first by design — data lives
// in the device's localStorage (same key as the original app, so existing data
// carries over) plus manual JSON backup / restore. No network required.
export const CONSENTS_KEY = 'mjm.consents.v2';

export function loadConsents() {
  let consents = [];
  try {
    const raw = localStorage.getItem(CONSENTS_KEY);
    if (raw) consents = JSON.parse(raw) || [];
  } catch (e) {
    consents = [];
  }
  // Migrate older shapes.
  consents.forEach((c) => {
    if (!Array.isArray(c.scans)) c.scans = [];
    if (!Array.isArray(c.seen)) c.seen = [];
    if (typeof c.unique !== 'number') c.unique = c.seen.length;
    if (typeof c.over !== 'number') c.over = 0;
    if (!('completedFired' in c)) c.completedFired = c.unique >= c.qty;
    if (!('overFired' in c)) c.overFired = c.unique > c.qty;
  });
  return consents;
}

export function saveConsents(consents) {
  try {
    localStorage.setItem(CONSENTS_KEY, JSON.stringify(consents));
  } catch (e) {
    /* storage full / unavailable — ignore */
  }
}

export function newConsent(customer, qty, ref) {
  return {
    id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    customer,
    qty,
    ref,
    createdAt: Date.now(),
    scans: [],
    seen: [],
    unique: 0,
    over: 0,
    completedAt: null,
    completedFired: false,
    overFired: false,
  };
}

export function statusOf(c) {
  if (c.unique > c.qty) return 'over';
  if (c.unique >= c.qty && c.qty > 0) return 'done';
  if (c.unique > 0) return 'progress';
  return 'pending';
}

export function downloadBackup(consents) {
  const payload = {
    app: 'mjm-scan-counter',
    version: 2,
    exportedAt: new Date().toISOString(),
    consents,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mjm-scan-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackup(file, current, replace) {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : Array.isArray(data.consents) ? data.consents : null;
  if (!incoming) throw new Error('Unrecognised file');
  if (replace) return incoming.slice();
  const merged = current.slice();
  const byId = new Map(merged.map((c) => [c.id, c]));
  incoming.forEach((c) => {
    const existing = byId.get(c.id);
    if (!existing) merged.push(c);
    else if ((c.unique || 0) >= (existing.unique || 0)) Object.assign(existing, c);
  });
  return merged;
}
