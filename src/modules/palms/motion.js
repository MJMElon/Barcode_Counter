import { ACTIVITIES, diffDays, keyLabel, nurseryOfPlot } from './data.js';

// Motion study — how long each activity actually takes, read off the logs
// rather than the ideal-day table.
//
// The unit of measurement is a CYCLE: Saringan Anak Bibit through to
// Pengambilan, one intake of seedlings worked through from start to sale. A
// plot goes round this cycle again and again, so the same activity has one
// figure per cycle and the interesting numbers are the shortest and the
// longest of them.
//
// Two activities can run at once now, which is why a span of several
// activities is measured from the first one's start to the last one's end
// rather than by adding their durations up: overlapping days must be counted
// once, not twice.

export const FIRST_ACT = 1; // Saringan Anak Bibit
export const LAST_ACT = 11; // Pengambilan

// Split one unit's log into cycles.
//
// A cycle opens at Saringan Anak Bibit and closes when Pengambilan finishes.
// Entries recorded before the first Saringan are left out: there is no way to
// know how much of that cycle happened before the plot was being logged, and
// a half-measured cycle would drag the minimum down.
export function cyclesOf(log) {
  const rows = (log || []).slice().sort((a, b) => a.no - b.no);
  const out = [];
  let cur = null;
  rows.forEach((e) => {
    // Saringan opens a cycle. If one is already running it only starts a new
    // cycle once that one has moved past Saringan — otherwise a stage keyed
    // in, stopped and picked up again would look like a second intake.
    if (e.actN === FIRST_ACT && (!cur || cur.entries.some((x) => x.actN > FIRST_ACT))) {
      if (cur) out.push(cur);
      cur = { entries: [] };
    }
    if (!cur) return; // still in the unmeasurable head of the log
    cur.entries.push(e);
    if (e.actN === LAST_ACT && e.end) {
      out.push(cur);
      cur = null;
    }
  });
  if (cur) out.push(cur);
  return out;
}

// Every unit that has anything logged, optionally narrowed to one nursery.
/**
 * The units with any history, narrowed to a nursery.
 * `nurseryKey` is a single key, 'all', or a list of keys — a list is how a
 * user restricted to some nurseries asks for "all" of the ones they may see.
 */
export function unitsOf(db, nurseryKey) {
  const keys = Array.isArray(nurseryKey) ? nurseryKey : null;
  return Object.keys(db.logs || {}).filter((k) => {
    if (!(db.logs[k] || []).length) return false;
    if (keys) return keys.includes(nurseryOfPlot(k.split('#')[0]));
    if (!nurseryKey || nurseryKey === 'all') return true;
    return nurseryOfPlot(k.split('#')[0]) === nurseryKey;
  });
}

function summarise(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.days - b.days);
  const total = sorted.reduce((s, x) => s + x.days, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((total / sorted.length) * 10) / 10,
  };
}

// Days one activity took inside one cycle. An activity keyed in twice in the
// same cycle — stopped and picked up again — counts as the days worked, not
// the calendar span, so an idle gap in between is not charged to it.
function daysForActivity(cycle, n) {
  const parts = cycle.entries.filter((e) => e.actN === n && e.end);
  if (!parts.length) return null;
  const days = parts.reduce((s, e) => s + Math.max(0, diffDays(e.start, e.end)), 0);
  return { days, end: parts[parts.length - 1].end };
}

// Shortest / longest / average days per activity across every cycle logged.
export function perActivityStats(db, nurseryKey) {
  const units = unitsOf(db, nurseryKey);
  const byAct = {};
  ACTIVITIES.forEach((a) => (byAct[a.n] = []));

  units.forEach((key) => {
    cyclesOf(db.logs[key]).forEach((cycle) => {
      ACTIVITIES.forEach((a) => {
        const d = daysForActivity(cycle, a.n);
        if (d) byAct[a.n].push({ days: d.days, key, label: keyLabel(key), end: d.end });
      });
    });
  });

  return ACTIVITIES.map((a) => ({ act: a, stats: summarise(byAct[a.n]) }));
}

// Days a run of activities took inside one cycle — first activity's start to
// last activity's end. Measuring the span is what keeps two activities that
// ran on the same days from being counted twice.
export function spanStats(db, nurseryKey, fromN, toN) {
  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);
  const units = unitsOf(db, nurseryKey);
  const samples = [];

  units.forEach((key) => {
    cyclesOf(db.logs[key]).forEach((cycle) => {
      const starts = cycle.entries.filter((e) => e.actN === lo).map((e) => e.start);
      const ends = cycle.entries.filter((e) => e.actN === hi && e.end).map((e) => e.end);
      if (!starts.length || !ends.length) return; // cycle does not cover the run
      const start = starts.sort()[0];
      const end = ends.sort()[ends.length - 1];
      const days = diffDays(start, end);
      if (days >= 0) samples.push({ days, key, label: keyLabel(key), start, end });
    });
  });

  return summarise(samples);
}

// The ideal the span is being judged against, for comparison.
export function idealSpan(fromN, toN) {
  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);
  return ACTIVITIES.filter((a) => a.n >= lo && a.n <= hi).reduce((s, a) => s + a.days, 0);
}
