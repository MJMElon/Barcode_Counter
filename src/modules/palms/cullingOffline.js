import { PERMANENT, flushOutbox, isOnline, looksOffline, queueJob } from '../../lib/outbox.js';
import { raiseCase } from '../../lib/nelos.js';

/**
 * The Culling Calculator without a signal.
 *
 * Counting pokok inang happens standing in a plot, which is exactly where
 * there is no bar of signal — a nursery is the far end of the coverage, not
 * the near end. A calculator that needs the network to show a plot, or to
 * accept the count that was just walked for, is a calculator that fails at
 * the only moment it is used.
 *
 * Two halves, and neither of them is a separate "offline mode": the same code
 * runs either way, which is the rule the rest of this portal follows.
 *
 *   READING   the blocks are kept on the device after every good read, and
 *             served from there when the network cannot answer.
 *   WRITING   the case goes into the shared outbox and is sent when the
 *             signal returns, exactly like a maintenance record.
 */

/* Bumped when the shape of a block changes, so an old device serving an old
   cache to new code cannot show figures the new code would read differently.
   A missed cache costs one read; a misread one costs a wrong decision. */
const CACHE_KEY = 'mjm_culling_blocks_v1';

/** Keep what was just read, for the next time there is nothing to read. */
export function cacheBlocks(rows) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows: rows || [] }));
  } catch (e) {
    /* A full or refused storage is not a reason to fail the read that just
       succeeded — the person has their figures either way. */
  }
}

/**
 * The blocks from the last good read.
 *
 * @returns {{ rows: Array, at: number } | null} null when there has never
 *   been one, which the screen shows as an empty list rather than as an error:
 *   a Field Conductor who has never opened this with a signal has nothing to
 *   count against, and saying so plainly beats a spinner.
 */
export function cachedBlocks() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!raw || !Array.isArray(raw.rows)) return null;
    return { rows: raw.rows, at: Number(raw.at) || 0 };
  } catch (e) {
    return null;
  }
}

/* One kind of queued job, named so an older build that does not know it
   leaves it alone rather than dropping it. */
const CULL_JOB = 'culling_case';

/**
 * Raise a case, signal or no signal.
 *
 * Offline it goes straight to the queue; online it is tried and only queued
 * if the attempt failed for a reason a retry could fix. A 400 because a
 * column is missing is not that, and must reach the person instead of sitting
 * in a queue nobody looks at.
 *
 * @returns the same { data, error, deduped } raiseCase gives, plus `queued`.
 */
export async function submitCase(args) {
  if (!isOnline()) {
    await queueJob(CULL_JOB, args);
    return { data: null, error: null, queued: true };
  }
  const res = await raiseCase(args);
  if (res && res.error && looksOffline(res.error)) {
    await queueJob(CULL_JOB, args);
    return { data: null, error: null, queued: true };
  }
  return { ...res, queued: false };
}

/**
 * Send whatever the queue is holding.
 *
 * Dedupe is left on for a queued case: the flush may be the second attempt at
 * one the server already took, and an auditor sent twice to the same plot is
 * the cost of getting that wrong.
 */
export function flushCulling() {
  return flushOutbox({
    [CULL_JOB]: async (payload) => {
      const res = await raiseCase({ ...payload, dedupe: true });
      if (res && res.error) {
        // Only a network failure is worth keeping. Anything else would sit in
        // the queue for ever, blocking everything behind it.
        if (looksOffline(res.error)) throw res.error;
        throw new Error(PERMANENT);
      }
    },
  });
}
