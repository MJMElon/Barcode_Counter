import { ACTIVITIES, INCENTIVE, MULTI, diffDays, keyLabel, nurseryOfPlot } from './data.js';

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
//
// This is THE definition of how long an activity took. It used to compete with
// a span measured from the activity's first start to its last end, and on a
// plot whose Lining was keyed in January and picked up again in October the
// two answers were 26 days and 314. A span is right for a RUN across different
// activities, where days shared by two of them must count once; it is wrong
// for one activity, where it bills the standing idle.
function daysForActivity(cycle, n) {
  const parts = cycle.entries.filter((e) => e.actN === n && e.end);
  if (!parts.length) return null;
  const days = parts.reduce((s, e) => s + Math.max(0, diffDays(e.start, e.end)), 0);
  return { days, start: parts[0].start, end: parts[parts.length - 1].end };
}

// Every measurement of one activity, one per cycle that finished it.
function activitySamples(db, nurseryKey, n, month) {
  const out = [];
  unitsOf(db, nurseryKey).forEach((key) => {
    cyclesOf(db.logs[key]).forEach((cycle) => {
      const d = daysForActivity(cycle, n);
      if (d && inMonth(month, d.end)) {
        out.push({ days: d.days, key, label: keyLabel(key), start: d.start, end: d.end });
      }
    });
  });
  return out;
}

// Shortest / longest / average for one activity across every plot.
export function activityStats(db, nurseryKey, n, month) {
  return summarise(activitySamples(db, nurseryKey, n, month));
}

// The same activity, split by plot: which plots take longest over it. Slowest
// first, because that is the list worth acting on.
export function perUnitActivityStats(db, nurseryKey, n, month) {
  const by = {};
  activitySamples(db, nurseryKey, n, month).forEach((s) => {
    (by[s.key] = by[s.key] || []).push(s);
  });
  return Object.keys(by)
    .map((key) => ({ key, label: keyLabel(key), stats: summarise(by[key]) }))
    .sort((a, b) => b.stats.avg - a.stats.avg);
}

// A measurement belongs to the month it FINISHED in — that is the month the
// work was signed off, and it is the only date every measurement has.
// `month` is 'YYYY-MM', or empty for every month.
function inMonth(month, date) {
  return !month || (date || '').slice(0, 7) === month;
}

// Every month that has at least one finished measurement, newest first, so the
// picker only ever offers months with something behind them.
export function monthsWithData(db, nurseryKey) {
  const set = new Set();
  unitsOf(db, nurseryKey).forEach((key) => {
    cyclesOf(db.logs[key]).forEach((cycle) => {
      cycle.entries.forEach((e) => {
        if (e.end) set.add(e.end.slice(0, 7));
      });
    });
  });
  return [...set].sort().reverse();
}

// Shortest / longest / average days per activity across every cycle logged.
// Built from the same samples as activityStats, so the table and the summary
// above it read one number each way.
export function perActivityStats(db, nurseryKey, month) {
  return ACTIVITIES.map((a) => ({ act: a, stats: activityStats(db, nurseryKey, a.n, month) }));
}

// Days a run of activities took inside one cycle — first activity's start to
// last activity's end. Measuring the span is what keeps two activities that
// ran on the same days from being counted twice.
function spanSamples(db, nurseryKey, fromN, toN, month) {
  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);
  const samples = [];

  unitsOf(db, nurseryKey).forEach((key) => {
    cyclesOf(db.logs[key]).forEach((cycle) => {
      const starts = cycle.entries.filter((e) => e.actN === lo).map((e) => e.start);
      const ends = cycle.entries.filter((e) => e.actN === hi && e.end).map((e) => e.end);
      if (!starts.length || !ends.length) return; // cycle does not cover the run
      const start = starts.sort()[0];
      const end = ends.sort()[ends.length - 1];
      const days = diffDays(start, end);
      if (days >= 0 && inMonth(month, end)) samples.push({ days, key, label: keyLabel(key), start, end });
    });
  });

  return samples;
}

export function spanStats(db, nurseryKey, fromN, toN, month) {
  return summarise(spanSamples(db, nurseryKey, fromN, toN, month));
}

// The same run, but split by plot rather than pooled: which plots take longest
// over it. Slowest first, because that is the list worth acting on.
export function perUnitStats(db, nurseryKey, fromN, toN, month) {
  const by = {};
  spanSamples(db, nurseryKey, fromN, toN, month).forEach((s) => {
    (by[s.key] = by[s.key] || []).push(s);
  });
  return Object.keys(by)
    .map((key) => ({ key, label: keyLabel(key), stats: summarise(by[key]) }))
    .sort((a, b) => b.stats.avg - a.stats.avg);
}

/* ---------- the speed incentive ----------
   A run finished inside TARGET_DAYS earns it. Fifteen days from Saringan Anak
   Bibit to Transplanting is the rule this was built for; the run itself is
   whatever is selected on the page.

   Aggregates cannot answer this. A plot with cycles of 12, 30 and 33 days
   reports "min 12, avg 25" — you can see somebody once managed 12 days, but
   not which cycle, not when it finished, and so not whether to pay it. The
   incentive needs one row per completed run.

   Areas are judged separately, because that is how the work is logged. But an
   area too small to be a fair test is listed and marked not entitled rather
   than hidden: an exclusion you cannot see is one you cannot check. */
export const TARGET_DAYS = 15;

export function incentiveRuns(db, nurseryKey, fromN, toN, month, minAreaPct) {
  const floor = minAreaPct == null ? INCENTIVE.minAreaPct : minAreaPct;
  return spanSamples(db, nurseryKey, fromN, toN, month)
    .map((s) => {
      const [plot, area] = s.key.split('#');
      // A whole plot is always entitled; a share is only known for a split one.
      const pct = area && MULTI[plot] ? Number(MULTI[plot].weights[area]) || 0 : 100;
      const entitled = pct >= floor;
      return {
        ...s,
        plot,
        area: area || null,
        pct,
        entitled,
        withinTarget: s.days <= TARGET_DAYS,
        qualified: entitled && s.days <= TARGET_DAYS,
      };
    })
    .sort((a, b) => a.days - b.days || a.label.localeCompare(b.label));
}

// The ideal the span is being judged against, for comparison.
export function idealSpan(fromN, toN) {
  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);
  return ACTIVITIES.filter((a) => a.n >= lo && a.n <= hi).reduce((s, a) => s + a.days, 0);
}
