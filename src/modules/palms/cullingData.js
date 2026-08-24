// Culling Calculator — the numbers on screen and the formulas over them.
//
// Two different things live here and they are kept apart on purpose:
//
//   FIGURES   Transplant and Baki, read off the Seedling Stock ledger by
//             cullingFigures.js. Nobody types these; they are refreshed from
//             the server and cached so the calculator still works offline.
//   ENTRIES   Pokok Inang (Field Conductor, then Site Auditor) and the video
//             filename. These are typed in the field and belong to the
//             device until there is somewhere to send them.
//
// They were one blob before, dealt as random trial values. Refreshing the
// figures would then have wiped the amounts somebody had just keyed in, so
// entries are stored per plot and survive every refresh.

import { NURSERIES as PALMS_NURSERIES, plotsOf } from './data.js';
import { loadCullingFigures } from './cullingFigures.js';

/** The nurseries, with the long name the plot modal shows. Plots themselves
    come from PALMS, so there is one list of what exists, not two. */
export const NURSERIES = {
  BNN: { prefix: PALMS_NURSERIES.BNN.prefix, count: PALMS_NURSERIES.BNN.count, label: '' },
  UNN1: { prefix: PALMS_NURSERIES.UNN1.prefix, count: PALMS_NURSERIES.UNN1.count, label: 'Nurseri Ulu 1' },
  UNN2: { prefix: PALMS_NURSERIES.UNN2.prefix, count: PALMS_NURSERIES.UNN2.count, label: 'Nurseri Ulu 2' },
};

const STORE_KEY = 'palms_culling_v2';

let sessionData = null;

/** A plot with no server figures yet: the rate is unknown, not zero. */
function blankRow(plot) {
  return { plot, transplant: 0, balance: 0, pokok: null, pokokAuditor: null, video: null };
}

function buildRows() {
  const data = {};
  for (const key in NURSERIES) data[key] = plotsOf(key).map(blankRow);
  return data;
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Entries and the last figures seen, keyed by plot so neither can be lost
    by the other being rewritten. */
export function persistSessionData() {
  try {
    const entries = {};
    const figures = {};
    for (const key in sessionData) {
      for (const r of sessionData[key]) {
        if (r.pokok !== null || r.pokokAuditor !== null || r.video) {
          entries[r.plot] = { pokok: r.pokok, pokokAuditor: r.pokokAuditor, video: r.video };
        }
        if (r.transplant) figures[r.plot] = { transplant: r.transplant, balance: r.balance };
      }
    }
    localStorage.setItem(STORE_KEY, JSON.stringify({ entries, figures }));
    return true;
  } catch (e) {
    return false;
  }
}

export function getSessionData() {
  if (sessionData) return sessionData;
  sessionData = buildRows();
  const saved = readStored() || {};
  const entries = saved.entries || {};
  const figures = saved.figures || {};
  for (const key in sessionData) {
    for (const r of sessionData[key]) {
      Object.assign(r, entries[r.plot] || {}, figures[r.plot] || {});
    }
  }
  return sessionData;
}

/**
 * Pull Transplant and Baki from the Seedling Stock ledger into the rows.
 *
 * Best effort by design: this runs on a phone that may have no signal, and a
 * calculator that cannot reach the office must still show the amounts already
 * keyed in and whatever figures it cached last time. Returns true when the
 * numbers were refreshed.
 */
export async function refreshFigures() {
  const data = getSessionData();
  let figures;
  try {
    figures = await loadCullingFigures();
  } catch (e) {
    console.warn('[culling] could not read plot figures:', (e && e.message) || e);
    return false;
  }
  for (const key in data) {
    for (const r of data[key]) {
      const f = figures.get(r.plot.toUpperCase());
      // A plot that has dropped out of the ledger keeps its last known
      // figures rather than silently resetting to an unknown rate.
      if (f) { r.transplant = f.transplant; r.balance = f.balance; }
    }
  }
  persistSessionData();
  return true;
}

/** Clear what people typed. The figures are the office's, not the demo's, so
    they are left alone — reseeding plot statuses does not un-transplant a
    plot. */
export function resetSessionData() {
  const data = getSessionData();
  for (const key in data) {
    for (const r of data[key]) { r.pokok = null; r.pokokAuditor = null; r.video = null; }
  }
  persistSessionData();
  return data;
}

/** True once the plot has real figures behind it; false means "cannot say",
    which the screen shows as — rather than as 0.00%. */
export function hasFigures(row) {
  return !!row && row.transplant > 0;
}

// rate = (Baki − Pokok Inang FC − Pokok Inang Auditor) / Transplant
// (amounts treated as 0 before they are filled in)
export function cullingRate(balance, pokok, pokokAuditor, transplant) {
  const p = pokok || 0;
  const pa = pokokAuditor || 0;
  if (!transplant) return 0;
  return (balance - p - pa) / transplant;
}

export function fmtPct(fraction) {
  return (fraction * 100).toFixed(2) + '%';
}

export function fmtNum(n) {
  return n.toLocaleString('en-US');
}

// video evidence is needed when the Auditor amount is submitted but the rate
// is still above 10%
export function videoNeeded(row) {
  return (
    hasFigures(row) &&
    row.pokokAuditor !== null &&
    cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant) > 0.1
  );
}
