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

/* ---------- multi-area plots (only B1, B4 & U8) ----------
   The map photos live in maps.js and are imported only where shown (the
   area-map modal) so other modules that read this data stay lightweight. */
export const MULTI = {
  U8: {
    areas: ['A', 'B', 'C'],
    weights: { A: 33, B: 33, C: 33 },
    cap: 'U8 mempunyai 3 kawasan (A, B, C) — setiap kawasan 33%. Mana-mana 2 kawasan = 70% plot.',
  },
  B1: {
    areas: ['A', 'B'],
    weights: { A: 30, B: 70 },
    cap: 'B1 mempunyai 2 kawasan (A, B). Kawasan B = 70% plot, kawasan A = 30%.',
  },
  B4: {
    areas: ['A', 'B'],
    weights: { A: 30, B: 70 },
    cap: 'B4 mempunyai 2 kawasan (A, B). Kawasan B = 70% plot, kawasan A = 30%.',
  },
};

// Area-map photo for a multi-area plot. They are static files under
// public/maps so they cache in the browser and stay out of the JS bundle.
export function areaMapUrl(pid) {
  return './maps/' + pid.toLowerCase() + '.jpeg';
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

/* ---------- state derivation ---------- */
export function currentEntry(db, pid) {
  const l = db.logs[pid];
  if (!l || !l.length) return null;
  const last = l[l.length - 1];
  return last.end === null ? last : null;
}
export function tickedToday(db, pid) {
  return db.updated[pid] && db.updated[pid].at === todayStr();
}
export function isLocked(db, pid) {
  return !!currentEntry(db, pid) && tickedToday(db, pid) && !db.unlocked[pid];
}

// status: "perlu perhatian" only for Membesar(<30d) & Pengambilan(<7d)
export function computeStatus(db, pid) {
  const cur = currentEntry(db, pid);
  if (!cur) return { state: 'none' };
  const act = activityByN(cur.actN);
  const due = addDays(cur.start, cur.ideal);
  const left = diffDays(todayStr(), due);
  if (left < 0) return { state: 'overdue', act, due, left, start: cur.start, key: pid };
  let soon = false;
  if (cur.actN === 10 && left < 30) soon = true;
  if (cur.actN === 11 && left < 7) soon = true;
  return { state: soon ? 'soon' : 'ontrack', act, due, left, start: cur.start, key: pid };
}
export function estEndDate(db, pid) {
  const cur = currentEntry(db, pid);
  if (!cur) return null;
  let s = 0;
  for (let n = cur.actN; n <= 11; n++) s += durFor(pid, activityByN(n));
  return addDays(cur.start, s);
}

/* ---------- multi-area derivation ---------- */
function bucket(p) {
  if (p < 40) return 30;
  if (p < 60) return 50;
  return 70;
}
function areaCategory(db, key) {
  const cur = currentEntry(db, key);
  if (!cur) return 'Kosong';
  if (cur.actN === 10) return 'Membesar';
  if (cur.actN === 11) return 'Pengambilan';
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
export function combinedLabel(db, pid) {
  const cfg = MULTI[pid];
  const cats = cfg.areas.map((a) => areaCategory(db, aKey(pid, a)));
  if (!cats.includes('Kosong')) {
    // every area is Membesar / Pengambilan -> weighted % label
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
  // some area still in an early stage -> show the most-behind area's activity
  const w = worstArea(db, pid);
  return w.st.state === 'none' ? '—' : w.st.act.name;
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
  if (isMulti(p)) {
    return MULTI[p].areas.some((a) => {
      const c = currentEntry(db, aKey(p, a));
      return c && c.actN === n;
    });
  }
  const c = currentEntry(db, p);
  return c && c.actN === n;
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

export function startEntry(db, pid, actN, dateStr, by) {
  db.logs[pid] = db.logs[pid] || [];
  db.logs[pid].push({ no: ++db.seq, actN, start: dateStr, end: null, ideal: durFor(pid, activityByN(actN)), by });
}

// Every save is appended here, so "show me what was keyed in on 3 Aug" is an
// exact answer rather than a guess reconstructed from the logs.
export function recordHistory(db, { key, actN, by, at }) {
  db.history = db.history || [];
  db.history.push({ at, key, actN, by });
}
export function historyOn(db, dateStr) {
  return (db.history || []).filter((h) => h.at === dateStr);
}

/* ---------- sample: simulate ~1 month of operation with logical dates ---------- */
function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}
function seedUnit(db, key) {
  const today = todayStr(),
    yest = addDays(today, -1);
  const stageWeights = [1, 2, 3, 3, 3, 3, 3, 3, 3, 6, 2];
  const pool = [];
  stageWeights.forEach((w, i) => {
    for (let j = 0; j < w; j++) pool.push(i + 1);
  });
  const C = pool[randInt(0, pool.length - 1)];
  const idealC = durFor(key, activityByN(C));
  let curStart;
  if (C >= 10) {
    const r = Math.random();
    if (r < 0.25) {
      const thr = C === 11 ? 7 : 30;
      curStart = addDays(today, -randInt(idealC - thr + 1, idealC - 1));
    } else if (r < 0.4) {
      curStart = addDays(today, -(idealC + randInt(1, 5)));
    } else {
      curStart = addDays(today, -randInt(1, Math.min(25, idealC - 1)));
    }
  } else {
    const late = Math.random() < 0.35;
    curStart = late ? addDays(today, -(idealC + randInt(1, 4))) : addDays(today, -randInt(1, Math.max(1, idealC)));
  }
  const entries = [{ actN: C, start: curStart, end: null, ideal: idealC }];
  let endCursor = curStart;
  for (let n = C - 1; n >= 1; n--) {
    const ideal = durFor(key, activityByN(n));
    const spent = Math.max(1, ideal + randInt(-1, 2));
    const start = addDays(endCursor, -spent);
    entries.unshift({ actN: n, start, end: endCursor, ideal });
    endCursor = start;
  }
  entries.forEach((e) => {
    e.no = ++db.seq;
    e.by = 'Contoh';
    // Mirror each stage change into the history so the dashboard's date
    // filter has a month of realistic activity to look back through.
    recordHistory(db, { key, actN: e.actN, by: 'Contoh', at: e.start });
  });
  db.logs[key] = entries;
  db.updated[key] = { by: 'Contoh', at: yest };
}
export function seedSample() {
  const db = freshDB();
  Object.keys(NURSERIES).forEach((k) =>
    plotsOf(k).forEach((pid) => {
      if (isMulti(pid)) MULTI[pid].areas.forEach((a) => seedUnit(db, aKey(pid, a)));
      else seedUnit(db, pid);
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
  const inScope = (key) => {
    const c = currentEntry(db, key);
    return !!c && CULLING_ACTS.has(c.actN);
  };
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
