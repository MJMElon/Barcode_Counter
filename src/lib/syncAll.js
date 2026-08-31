/**
 * The dashboard's one Sync button.
 *
 * Everything here already happens by itself — each module flushes its own
 * outbox when the line returns and refreshes its own cache when opened. The
 * button exists for the moment BEFORE the field: standing somewhere with
 * signal, about to walk into somewhere without, a Field Conductor wants to
 * press one thing and know the phone is loaded — queued work sent up, fresh
 * data pulled down — rather than trust that five modules each did their part
 * at some point.
 *
 * PUSH first, then PULL, so what was recorded offline is on the server
 * before the caches are re-read — a pull first would fetch a picture the
 * phone's own queue is about to change.
 *
 * Dynamic imports throughout: the modules are lazy-loaded chunks (see
 * App.jsx) and a static import here would weld the scanner, PALMS and
 * maintenance into the shell bundle the dashboard ships in.
 *
 * The stamp is only written when EVERY step succeeded — the card shows the
 * last time a sync fully worked, not the last time one was attempted, so
 * the date on it can be trusted the way it reads.
 */
import { isOnline } from './outbox.js';

export const SYNC_STAMP_KEY = 'mjm_fc_last_sync_v1';

/** { at, ok } of the last fully successful sync, or null. */
export function lastSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_STAMP_KEY));
    return s && s.at ? s : null;
  } catch (e) {
    return null;
  }
}

export async function syncAll() {
  if (!isOnline()) return { ok: false, offline: true, steps: [] };

  const steps = [];
  const run = async (name, fn) => {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (e) {
      steps.push({ name, ok: false, error: String((e && e.message) || e).slice(0, 200) });
    }
  };

  // ── PUSH: everything this phone has queued ──
  await run('culling queue', async () => {
    const m = await import('../modules/palms/cullingOffline.js');
    await m.flushCulling();
  });
  await run('maintenance queue', async () => {
    const m = await import('../modules/maintenance/data.js');
    await m.flushMaintenance();
  });
  // PALMS is push AND pull in one call — its own sync merges both ways.
  await run('palms', async () => {
    const m = await import('../modules/palms/sync.js');
    const r = await m.syncPalms();
    // syncPalms answers null when it could not reach the server at all.
    if (r === null) throw new Error('PALMS could not reach the server');
  });

  // ── PULL: refresh what the offline caches hold ──
  await run('culling blocks', async () => {
    const m = await import('../modules/palms/cullingSource.js');
    await m.loadPlots();
  });
  await run('consents & bookings', async () => {
    const m = await import('../modules/scan/store.js');
    await m.fetchConsents();
    await m.fetchTodayBookingALs();
  });

  const ok = steps.every((s) => s.ok);
  const at = Date.now();
  if (ok) {
    try { localStorage.setItem(SYNC_STAMP_KEY, JSON.stringify({ at, ok: true })); } catch (e) { /* */ }
  }
  return { ok, offline: false, steps, at };
}
