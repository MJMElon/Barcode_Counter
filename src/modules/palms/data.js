import { loadSettings } from './settings.js';

// PALMS — Plot Activity Log Monitoring System, data layer.
// Ported from the standalone NurseryPALMS app. Data stays offline on the
// device in localStorage under the SAME key the standalone app used, so
// anything already recorded on a device carries over.

export const NURSERIES = {
  BNN: { label: 'BNN', prefix: 'B', count: 14 },
  UNN1: { label: 'UNN1', prefix: 'U', count: 18 },
  UNN2: { label: 'UNN2', prefix: 'N', count: 20 },
};

// Activity names are nursery domain vocabulary and stay as-is in both
// languages; `days` is the ideal duration of the stage.
// `mShort` is the phone-sized label — the picker has to show all eleven
// activities without the Field Conductor scrolling.
export const ACTIVITIES = [
  { n: 1, name: 'Saringan Anak Bibit', mShort: 'Saringan bibit', short: 'Saringan Anak Bibit', days: 2 },
  { n: 2, name: 'Tunggu buat culling', mShort: 'Tunggu culling', short: 'Tunggu cull', days: 3 },
  { n: 3, name: 'Culling', mShort: 'Culling', short: 'Culling', days: 2 },
  { n: 4, name: 'Membersih', mShort: 'Membersih', short: 'Membersih', days: 1 },
  { n: 5, name: 'Meracun secara selingan', mShort: 'Meracun selingan', short: 'Meracun', days: 1 },
  { n: 6, name: 'Angkat tanah', mShort: 'Angkat tanah', short: 'Angkat tanah', days: 5 },
  { n: 7, name: 'Isi polibeg', mShort: 'Isi polibeg', short: 'Isi polibeg', days: 5 },
  { n: 8, name: 'Lining', mShort: 'Lining', short: 'Lining', days: 2 },
  { n: 9, name: 'Transplanting', mShort: 'Transplanting', short: 'Transplant', days: 2 },
  { n: 10, name: 'Membesar', mShort: 'Membesar', short: 'Membesar', days: 270 },
  { n: 11, name: 'Pengambilan', mShort: 'Pengambilan', short: 'Pengambilan', days: 30 },
];

const STORE_KEY = 'palms_status_v8';

/* ---------- plot layout & thresholds, from settings ----------
   MULTI and ATTENTION are filled from the saved settings at load and
   rewritten in place when they change, so every screen reading them picks
   the change up on its next render. */
export const MULTI = {};
export const ATTENTION = {};
// Incentive rules, hydrated from settings alongside the rest.
export const INCENTIVE = { minAreaPct: 25 };
let PHOTOS = {};

export function applySettings(s) {
  Object.keys(MULTI).forEach((k) => delete MULTI[k]);
  Object.entries(s.multi || {}).forEach(([k, v]) => {
    MULTI[k] = v;
  });
  Object.keys(ATTENTION).forEach((k) => delete ATTENTION[k]);
  Object.entries(s.attention || {}).forEach(([k, v]) => {
    ATTENTION[k] = Number(v);
  });
  PHOTOS = s.photos || {};
  INCENTIVE.minAreaPct = s.minArea == null ? 25 : Number(s.minArea);
}
applySettings(loadSettings());

// A photo of this plot on its own, if there is one. A sharp close-up beats a
// crop out of the whole-nursery map every time, so it wins when present.
// Returns null when the plot has neither an upload nor a shipped picture, so
// callers can fall back to the nursery map.
const SHIPPED_PHOTOS = new Set(['B1', 'B4', 'U8']);

export function plotPhoto(pid) {
  if (PHOTOS[pid]) return PHOTOS[pid];
  if (SHIPPED_PHOTOS.has(pid)) return './maps/' + pid.toLowerCase() + '.jpeg';
  return null;
}

// Older name, kept for the legacy band rendering.
export function areaMapUrl(pid) {
  return plotPhoto(pid) || '';
}

export function isMulti(pid) {
  return !!MULTI[pid];
}
export function areasOf(pid) {
  return isMulti(pid) ? MULTI[pid].areas : [];
}
export function aKey(pid, area) {
  return pid + '#' + area;
}
export function keyLabel(k) {
  return k.includes('#') ? k.replace('#', ' · ') : k;
}

/* ---------- storage ---------- */
export function freshDB() {
  return { logs: {}, updated: {}, editReq: {}, unlocked: {}, history: [], seq: 0 };
}

export function loadDB() {
  let db = freshDB();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) db = Object.assign(freshDB(), JSON.parse(raw));
  } catch (e) {
    /* storage unavailable -> run in-memory only */
  }
  // old requests were recorded as Admin's; they were the FC's
  Object.values(db.editReq || {}).forEach((r) => {
    if (r && r.by === 'Admin') r.by = 'FC';
  });
  return db;
}

export function saveDB(db) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- helpers ---------- */
export function plotsOf(nk) {
  const n = NURSERIES[nk];
  return Array.from({ length: n.count }, (_, i) => n.prefix + (i + 1));
}
export function nurseryOfPlot(p) {
  for (const k in NURSERIES) if (p.startsWith(NURSERIES[k].prefix)) return k;
  return null;
}
export function activityByN(n) {
  return ACTIVITIES.find((a) => a.n === n);
}
export function durFor(pid, act) {
  return act.days;
}

function fmt(d) {
  return (
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  );
}
export function todayStr() {
  return fmt(new Date());
}
export function parseD(s) {
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m - 1, dd);
}
export function addDays(s, n) {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}
export function diffDays(a, b) {
  return Math.round((parseD(b) - parseD(a)) / 86400000);
}
export function prettyD(s) {
  if (!s) return '—';
  return parseD(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// Wall-clock of a save, stored as plain "HH:MM" — enough to tell a Field
// Conductor when today's report went in, and readable straight from storage.
export function nowClock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------- state derivation ----------
   A plot can have more than one activity running at once — culling may still
   be going while the soil crew starts angkat tanah — so "what is open" is a
   list, not a single entry. */
export const MAX_CONCURRENT = 2;

export function currentEntries(db, pid) {
  return (db.logs[pid] || []).filter((e) => e.end === null);
}

// The first open activity. Kept for the places that only need one.
export function currentEntry(db, pid) {
  const open = currentEntries(db, pid);
  return open.length ? open[0] : null;
}
export function tickedToday(db, pid) {
  return db.updated[pid] && db.updated[pid].at === todayStr();
}
export function isLocked(db, pid) {
  return !!currentEntry(db, pid) && tickedToday(db, pid) && !db.unlocked[pid];
}

function statusOfEntry(pid, e) {
  const act = activityByN(e.actN);
  const due = addDays(e.start, e.ideal);
  const left = diffDays(todayStr(), due);
  if (left < 0) return { state: 'overdue', act, due, left, start: e.start, key: pid };
  // "Needs attention" is configured in Settings: an activity listed there
  // warns once fewer than that many days remain. Anything unlisted is only
  // ever on schedule or overdue.
  const warnAt = ATTENTION[e.actN];
  const soon = warnAt != null && left < warnAt;
  return { state: soon ? 'soon' : 'ontrack', act, due, left, start: e.start, key: pid };
}

const STATE_RANK = { overdue: 0, soon: 1, ontrack: 2, none: 3 };

// With two activities running, the plot is only as healthy as its worse one.
export function computeStatus(db, pid) {
  const open = currentEntries(db, pid);
  if (!open.length) return { state: 'none' };
  return open
    .map((e) => statusOfEntry(pid, e))
    .sort((a, b) => {
      const r = STATE_RANK[a.state] - STATE_RANK[b.state];
      return r !== 0 ? r : (a.left ?? Infinity) - (b.left ?? Infinity);
    })[0];
}

// Every activity open on this unit right now.
export function openActivities(db, pid) {
  return currentEntries(db, pid)
    .map((e) => activityByN(e.actN))
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);
}

export function estEndDate(db, pid) {
  const open = currentEntries(db, pid);
  if (!open.length) return null;
  // The plot is finished when its slowest running activity has worked through
  // the rest of the sequence.
  const ends = open.map((e) => {
    let s = 0;
    for (let n = e.actN; n <= 11; n++) s += durFor(pid, activityByN(n));
    return addDays(e.start, s);
  });
  return ends.sort()[ends.length - 1];
}

/* ---------- multi-area derivation ---------- */
function bucket(p) {
  if (p < 40) return 30;
  if (p < 60) return 50;
  return 70;
}
function areaCategory(db, key) {
  const ns = currentEntries(db, key).map((e) => e.actN);
  if (ns.includes(11)) return 'Pengambilan';
  if (ns.includes(10)) return 'Membesar';
  return 'Kosong';
}
export function worstArea(db, pid) {
  const rank = { overdue: 0, soon: 1, ontrack: 2, none: 3 };
  const arr = MULTI[pid].areas.map((a) => ({ area: a, key: aKey(pid, a), st: computeStatus(db, aKey(pid, a)) }));
  arr.sort((x, y) => {
    const rx = rank[x.st.state],
      ry = rank[y.st.state];
    if (rx !== ry) return rx - ry; // worse state first
    const lx = x.st.left == null ? Infinity : x.st.left;
    const ly = y.st.left == null ? Infinity : y.st.left;
    return lx - ly; // then earliest due date / most overdue
  });
  return arr[0];
}
export function multiStatus(db, pid) {
  return worstArea(db, pid).st;
}
// A plot split into areas is described by what share of it is at each
// category — "30% Kosong, 70% Pengambilan" — using each area's weight.
//
// Kosong counts towards that mix. It used to be excluded: any area at an
// early stage sent the whole plot down the fallback below, so a plot with
// 70% at Pengambilan reported only the early area's activity and the
// collection went unmentioned. The Kosong share was computed and then never
// shown.
export function combinedLabel(db, pid) {
  const cfg = MULTI[pid];
  const cats = cfg.areas.map((a) => areaCategory(db, aKey(pid, a)));

  // Nothing growing anywhere: the activity name is more use than "100% Kosong".
  if (cats.every((c) => c === 'Kosong')) {
    const w = worstArea(db, pid);
    return w.st.state === 'none' ? '—' : w.st.act.name;
  }

  const pct = { Kosong: 0, Pengambilan: 0, Membesar: 0 };
  cfg.areas.forEach((a) => {
    pct[areaCategory(db, aKey(pid, a))] += cfg.weights[a];
  });
  const order = ['Kosong', 'Pengambilan', 'Membesar'];
  const nz = order.filter((c) => pct[c] > 0);
  if (nz.length === 0) return '—';
  if (nz.length === 1) return nz[0];
  return nz.map((c) => `${bucket(pct[c])}% ${c}`).join(', ');
}
export function effStatus(db, p) {
  return isMulti(p) ? multiStatus(db, p) : computeStatus(db, p);
}
export function effActivityName(db, p) {
  if (isMulti(p)) return combinedLabel(db, p);
  const st = computeStatus(db, p);
  return st.state === 'none' ? '—' : st.act.name;
}
export function effEstEnd(db, p) {
  if (isMulti(p)) {
    const s = multiStatus(db, p);
    return s.key ? estEndDate(db, s.key) : null;
  }
  return estEndDate(db, p);
}
export function plotInActivity(db, p, n) {
  const keys = isMulti(p) ? MULTI[p].areas.map((a) => aKey(p, a)) : [p];
  return keys.some((k) => currentEntries(db, k).some((e) => e.actN === n));
}

/* ---------- entry grid units ---------- */
export function entryUnits(nk) {
  const units = [];
  plotsOf(nk).forEach((pid) => {
    if (isMulti(pid)) {
      MULTI[pid].areas.forEach((a, i) =>
        units.push({ key: aKey(pid, a), label: `${pid} · ${a}`, pid, area: a, info: i === 0 })
      );
    } else {
      units.push({ key: pid, label: pid, pid, area: null, info: false });
    }
  });
  return units;
}

// Record one unit's activities for a day.
//
// Whatever the Field Conductor leaves out is treated as finished: an activity
// that was running yesterday and is not chosen today gets closed with today's
// date. That is how "angkat tanah is done" gets recorded without anyone having
// to say so.
// `ts` is the clock time of the save, kept so a second save on the same day
// can say when the first one was.
export function applyDailySelection(db, key, selected, by, date, ts) {
  const sel = [...new Set(selected)].slice(0, MAX_CONCURRENT).sort((a, b) => a - b);
  const open = currentEntries(db, key);
  let changed = false;

  open.forEach((e) => {
    if (!sel.includes(e.actN)) {
      e.end = date;
      changed = true;
    }
  });
  sel.forEach((n) => {
    if (!open.some((e) => e.actN === n && e.end === null)) {
      startEntry(db, key, n, date, by);
      changed = true;
    }
  });

  db.updated[key] = { by, at: date, ts: ts || nowClock() };
  recordHistory(db, { key, acts: sel, by, at: date });
  return changed;
}

export function startEntry(db, pid, actN, dateStr, by) {
  db.logs[pid] = db.logs[pid] || [];
  db.logs[pid].push({ no: ++db.seq, actN, start: dateStr, end: null, ideal: durFor(pid, activityByN(actN)), by });
}

// Every save is appended here, so "show me what was keyed in on 3 Aug" is an
// exact answer rather than a guess reconstructed from the logs.
export function recordHistory(db, { key, actN, acts, by, at }) {
  db.history = db.history || [];
  const row = { at, key, acts: acts || (actN != null ? [actN] : []), by };
  // A day holds one report per unit. Saving the nursery twice — a correction
  // an hour later — rewrites that day's row instead of stacking a second one.
  const i = db.history.findIndex((h) => h.key === key && h.at === at);
  if (i >= 0) db.history[i] = row;
  else db.history.push(row);
  // A daily report across three nurseries is ~56 rows; keep about a year of
  // them so the device's storage does not creep upwards forever.
  const CAP = 20000;
  if (db.history.length > CAP) db.history = db.history.slice(-CAP);
}

// Activity numbers a history row covers, tolerating rows written before a
// plot could run two activities at once.
export function historyActs(h) {
  if (Array.isArray(h.acts)) return h.acts;
  return h.actN != null ? [h.actN] : [];
}
export function historyOn(db, dateStr) {
  return (db.history || []).filter((h) => h.at === dateStr);
}

/* ---------- sample data ----------
   Built to be checked rather than to look plausible: every activity from 1 to
   11 is represented, and the three statuses (on schedule, needs attention,
   overdue) all appear, so the pipeline, the stat cards and the filters each
   have something to show. Prior stages are back-filled with sensible dates and
   written into the history, giving the date filter about a month to look
   through. */
function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

// mood: 'ontrack' | 'overdue' | 'soon'
// "soon" only exists for Membesar (<30 days left) and Pengambilan (<7), so it
// falls back to on-schedule for any earlier stage.
function seedUnit(db, key, actN, mood, by) {
  const today = todayStr();
  const idealC = durFor(key, activityByN(actN));
  let curStart;
  if (mood === 'overdue') {
    curStart = addDays(today, -(idealC + randInt(1, 6)));
  } else if (mood === 'soon' && (actN === 10 || actN === 11)) {
    const window = actN === 11 ? 7 : 30;
    curStart = addDays(today, -(idealC - randInt(1, window - 1)));
  } else {
    curStart = addDays(today, -randInt(0, Math.max(0, Math.min(20, idealC - 1))));
  }

  const entries = [{ actN, start: curStart, end: null, ideal: idealC }];
  let endCursor = curStart;
  for (let n = actN - 1; n >= 1; n--) {
    const ideal = durFor(key, activityByN(n));
    const spent = Math.max(1, ideal + randInt(-1, 2));
    const start = addDays(endCursor, -spent);
    entries.unshift({ actN: n, start, end: endCursor, ideal });
    endCursor = start;
  }
  // Two finished cycles behind the current one. The Motion Study measures
  // completed work, so without a past there would be nothing to look at until
  // the nursery had run a full intake through — about a year. These are not
  // written into the daily history: they are older than any date the filter
  // reaches back to, and 52 plots' worth would be a lot of rows to carry for
  // nothing.
  const past = [];
  let cursor = endCursor;
  for (let c = 0; c < 2; c++) {
    for (let n = 11; n >= 1; n--) {
      const ideal = durFor(key, activityByN(n));
      // Spread the durations either side of the ideal so shortest and longest
      // are actually different figures.
      const spent = Math.max(1, ideal + randInt(-Math.ceil(ideal * 0.3), Math.ceil(ideal * 0.4)));
      const start = addDays(cursor, -spent);
      past.unshift({ actN: n, start, end: cursor, ideal });
      cursor = start;
    }
  }
  // Numbered in the order they happened, oldest first: the Motion Study reads
  // a log back in that order to tell one cycle from the next.
  const all = [...past, ...entries];
  all.forEach((e) => {
    e.no = ++db.seq;
    e.by = by;
  });
  entries.forEach((e) => recordHistory(db, { key, actN: e.actN, by, at: e.start }));
  db.logs[key] = all;
}

// Fixed stages for the multi-area plots so the weighted label has something
// to show: B1 and U8 land on a Kosong/Pengambilan mix, B4 on Membesar with
// Pengambilan.
const MULTI_PLAN = {
  B1: { A: 5, B: 11 },
  B4: { A: 10, B: 11 },
  U8: { A: 11, B: 11, C: 4 },
};

export function seedSample() {
  const db = freshDB();
  const today = todayStr();
  const yest = addDays(today, -1);
  const moods = ['ontrack', 'overdue', 'soon'];
  let n = 0;

  Object.keys(NURSERIES).forEach((nk) =>
    plotsOf(nk).forEach((pid) => {
      const areas = isMulti(pid) ? MULTI[pid].areas : [null];
      areas.forEach((a, ai) => {
        const key = a ? aKey(pid, a) : pid;
        // Cycle the activities so all eleven are covered, and bias the
        // "needs attention" mood onto the two stages that can show it.
        const planned = a && MULTI_PLAN[pid] ? MULTI_PLAN[pid][a] : null;
        const actN = planned || (n % 11) + 1;
        let mood = moods[n % 3];
        if (mood === 'soon' && actN < 10) mood = 'ontrack';
        if (actN >= 10 && n % 4 === 0) mood = 'soon';

        seedUnit(db, key, actN, mood, 'Contoh');

        // Roughly every third unit is already keyed in today, so the train
        // shows a mix of done and outstanding. For a plot split into areas
        // only the FIRST area is done, which is what makes the area map
        // worth opening: one green, the rest still to do.
        const doneToday = a ? ai === 0 : n % 3 === 0;
        db.updated[key] = { by: 'Contoh', at: doneToday ? today : yest, ts: '07:30' };
        if (doneToday) recordHistory(db, { key, actN, by: 'Contoh', at: today });
        n++;
      });
    })
  );
  return db;
}

/* ---------- link for the Culling Calculator ----------
   A plot is "in culling scope" when its current PALMS activity is
   Saringan Anak Bibit (1), Tunggu buat culling (2), Culling (3) or
   Pengambilan (11) — for multi-area plots, when ANY area is. */
const CULLING_ACTS = new Set([1, 2, 3, 11]);
export function cullingScopePlots() {
  const db = loadDB();
  const inScope = (key) => currentEntries(db, key).some((e) => CULLING_ACTS.has(e.actN));
  const set = new Set();
  Object.keys(NURSERIES).forEach((nk) =>
    plotsOf(nk).forEach((pid) => {
      const hit = isMulti(pid) ? MULTI[pid].areas.some((a) => inScope(aKey(pid, a))) : inScope(pid);
      if (hit) set.add(pid);
    })
  );
  return set;
}
export function palmsHasData() {
  const db = loadDB();
  return Object.keys(db.logs || {}).length > 0;
}
