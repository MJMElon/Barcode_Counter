import { supabase } from '../../lib/supabase.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { PERMANENT, flushOutbox, looksOffline, queueJob } from '../../lib/outbox.js';

// The scan list is now driven by SIGNED CONSENTS from the mobile web
// (mobile_consent_records). When a consent is signed there, it appears here for
// the FC to scan seals against its quantity. Scanning progress (which barcodes
// were counted) is kept locally, keyed by the consent record id, so it survives
// reloads and works offline.

const CONSENTS_CACHE = 'scan_consents';
export const PROGRESS_KEY = 'mjm.scan.progress.v1';

export function defaultProgress() {
  return { seen: [], scans: [], unique: 0, over: 0, completedFired: false, overFired: false, completedAt: null, doIssued: false };
}

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

export function saveProgress(map) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch (e) {
    /* ignore */
  }
}

// Last-synced consent list (for instant load + offline).
export function cachedConsents() {
  return cacheGet(CONSENTS_CACHE)?.value || null;
}

// Pull signed consents from Supabase (newest first) and cache them.
export async function fetchConsents() {
  const { data, error } = await supabase
    .from('mobile_consent_records')
    .select('id, al_number, order_number, customer_name, consent_qty, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  cacheSet(CONSENTS_CACHE, data || []);
  return data || [];
}

// AL numbers that have a collection booking for TODAY → { al_number: 'HH:MM' }
// (earliest slot). Used to push today's collections to the top of the list.
const TODAY_AL_CACHE = 'scan_today_als';

export function cachedTodayALs() {
  return cacheGet(TODAY_AL_CACHE)?.value || {};
}

export async function fetchTodayBookingALs() {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('shared_collection_bookings')
    .select('al_number, start_time')
    .eq('booking_date', today)
    .neq('status', 'cancelled');
  if (error) throw error;
  const map = {};
  (data || []).forEach((b) => {
    if (!b.al_number) return;
    const t = (b.start_time || '99:99').slice(0, 5);
    if (!(b.al_number in map) || t < map[b.al_number]) map[b.al_number] = t;
  });
  cacheSet(TODAY_AL_CACHE, map);
  return map;
}

export function statusOf(c) {
  if (c.unique > c.qty) return 'over';
  if (c.unique >= c.qty && c.qty > 0) return 'done';
  if (c.unique > 0) return 'progress';
  return 'pending';
}

// Combine the synced consent records with local scan progress into the view
// models the UI renders (same shape the scanner expects). All consents with a
// customer name are shown — including walk-in (MANUAL-*) consents that have no
// linked AL order.
export function mergeConsents(serverList, progress) {
  return (serverList || [])
    .filter((s) => s.customer_name)
    .map((s) => {
      const p = progress[s.id] || defaultProgress();
    return {
      id: s.id,
      al_number: s.al_number || '',
      order_number: s.order_number || '',
      customer: s.customer_name || s.al_number || '—',
      qty: s.consent_qty || 0,
      ref: s.al_number || '',
      createdAt: s.created_at ? new Date(s.created_at).getTime() : 0,
      seen: p.seen || [],
      scans: p.scans || [],
      unique: p.unique || 0,
      over: p.over || 0,
      completedFired: !!p.completedFired,
      overFired: !!p.overFired,
      doIssued: !!p.doIssued,
      issuedQty: p.issuedQty || 0,
    };
  });
}

// ── Multi-device sync via Supabase (fcportal_scan_records table) ──────────────

// Persist a single scan event. ON CONFLICT DO NOTHING → unique(consent_id, barcode)
// prevents double-counting when two devices scan the same seal.
export async function insertScanRecord(consentId, alNumber, barcode) {
  const { error } = await supabase
    .from('fcportal_scan_records')
    .insert({ consent_id: consentId, al_number: alNumber, barcode });
  if (error && error.code !== '23505') throw error; // 23505 = unique_violation (safe to ignore)
}

/* A scan made with no line still reaches the server, later.
 *
 * The local progress is what THIS phone counts by, and it never needed the
 * network — but fcportal_scan_records is how OTHER devices hear a barcode
 * has been taken, and a scan made offline used to be skipped rather than
 * queued: the count survived on one phone while every other phone stayed
 * free to accept the same seedling again. Now it queues like everything
 * else in this repository and flushes on sync, on reconnect, and on the
 * 30-second tick. The unique index (23505 ignored above) makes a retry of
 * a row the server already took a no-op rather than a duplicate.
 */
export const SCAN_JOB = 'scan_record';

export async function saveScanRecord(consentId, alNumber, barcode) {
  try {
    await insertScanRecord(consentId, alNumber, barcode);
  } catch (e) {
    if (looksOffline(e)) {
      await queueJob(SCAN_JOB, { consentId, alNumber, barcode });
      return;
    }
    // The server refused it for a reason of its own; the local progress
    // still holds the scan, which is the behaviour this call always had.
  }
}

export function flushScanRecords() {
  return flushOutbox({
    [SCAN_JOB]: async (p) => {
      try {
        await insertScanRecord(p.consentId, p.alNumber, p.barcode);
      } catch (e) {
        if (looksOffline(e)) throw e;      // try again later
        throw new Error(PERMANENT);        // the server refused the row itself
      }
    },
  });
}

// Pull all barcodes already stored for a consent (from any device).
export async function fetchScanRecords(consentId) {
  const { data, error } = await supabase
    .from('fcportal_scan_records')
    .select('barcode, scanned_at')
    .eq('consent_id', consentId)
    .order('scanned_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Subscribe to live INSERTs for a consent. callback(barcode) fires when another
// device scans a new seal. Returns the channel — pass to unsubscribeScanRecords().
export function subscribeScanRecords(consentId, callback) {
  return supabase
    .channel('fcportal_scan:' + consentId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'fcportal_scan_records',
      filter: `consent_id=eq.${consentId}`,
    }, (payload) => callback(payload.new.barcode))
    .subscribe();
}

export function unsubscribeScanRecords(channel) {
  if (channel) supabase.removeChannel(channel);
}
