/**
 * Reading the office's maintenance schedule.
 *
 * Nursery Operation Management keeps one row per (nursery, month) in
 * nops_maint_state, with the whole month's plan in a JSON payload. This file
 * turns that payload into "for week N, this job is due on these plots, with
 * this chemical" — which is all a Field Conductor needs on a phone.
 *
 * The payload, as the office page writes it:
 *   pdConfig       { W1..W4: { P, P_dose, P_unit, P_sticker…, D, D_dose, … } }
 *   pd             { W1..W4: { <plot>: { P: bool, D: bool } } }
 *   manuringConfig [ round ][ col ] = { name, dose, unit }
 *   manuring       { <plot>: [ round ][ col ] = bool }
 *   interrowConfig [ round ][ col ] = { chem, chem_dose, chem_unit, activator_dose, activator_unit }
 *   interrow       { <plot>: [ round ][ col ] = bool }
 *   weeding        { <plot>: { R1: bool, R2: bool } }
 *
 * No imports, so it stays unit-testable in plain node.
 */

/** The four weeks the office plans in, and the days each one covers. */
export const WEEKS = [1, 2, 3, 4];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-04" → "Apr 2026", the key the office stores its schedule under. */
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  return m ? `${MONTH_ABBR[parseInt(m[2], 10) - 1]} ${m[1]}` : '';
}

/** The month a date falls in, in the office's own wording. */
export function monthLabelOf(dateStr) {
  return monthLabel(String(dateStr || '').slice(0, 7));
}

export function daysInMonthLabel(lbl) {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(String(lbl || '').trim());
  if (!m) return 31;
  const idx = MONTH_ABBR.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  if (idx < 0) return 31;
  return new Date(parseInt(m[2], 10), idx + 1, 0).getDate();
}

function ordinalDay(d) {
  const v = d % 100;
  const sfx = ['th', 'st', 'nd', 'rd'];
  return d + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
}

/** "1st - 7th". The last week runs to the end of the month. */
export function weekDates(week, mLabel) {
  const days = daysInMonthLabel(mLabel);
  const from = (week - 1) * 7 + 1;
  if (from > days) return '';
  const to = week === WEEKS.length ? days : Math.min(from + 6, days);
  return from === to ? ordinalDay(from) : `${ordinalDay(from)} - ${ordinalDay(to)}`;
}

/** Which week a day of the month belongs to — the 29th onwards is week 4. */
export function weekOfDate(dateStr) {
  const day = parseInt(String(dateStr || '').slice(8, 10), 10);
  if (!day) return 0;
  return Math.min(WEEKS.length, Math.ceil(day / 7));
}

const dose = (name, amount, unit) =>
  name && name !== '—' ? `${name}${amount ? ` ${amount}${unit || ''}` : ''}` : '';

/** "Daconil 50gm + Bond 15mL" — the chemical and its sticker, if any. */
function pdChemical(cfg, side) {
  if (!cfg) return '';
  const main = dose(cfg[side], cfg[`${side}_dose`], cfg[`${side}_unit`]);
  const stick = dose(cfg[`${side}_sticker`], cfg[`${side}_sticker_dose`], cfg[`${side}_sticker_unit`]);
  return [main, stick].filter(Boolean).join(' + ');
}

/**
 * Every job due in one week, as { key, plots: [{ plot, chemical }] }.
 *
 * P & D is planned per week, and the office ticks the insecticide (P) and the
 * fungicide (D) separately — a plot needing both is one visit with both named.
 * Manuring, weeding and inter-row are planned per ROUND, and a round is the
 * same seven-day block: round 1 is week 1. Weeding has no chemical.
 */
export function weekTasks(payload, week) {
  const s = payload || {};
  const wk = `W${week}`;
  const ri = week - 1;
  const out = {};

  // ── P & D ──
  const pdCfg = (s.pdConfig || {})[wk];
  const pdTicks = (s.pd || {})[wk] || {};
  out.pd = Object.keys(pdTicks)
    .filter((plot) => pdTicks[plot] && (pdTicks[plot].P || pdTicks[plot].D))
    .sort(plotCmp)
    .map((plot) => ({
      plot,
      chemical: [
        pdTicks[plot].P ? pdChemical(pdCfg, 'P') : '',
        pdTicks[plot].D ? pdChemical(pdCfg, 'D') : '',
      ].filter(Boolean).join(' + '),
    }));

  // ── Manuring ──
  const mCfg = (s.manuringConfig || [])[ri] || [];
  out.manuring = Object.keys(s.manuring || {})
    .filter((plot) => ((s.manuring[plot] || [])[ri] || []).some(Boolean))
    .sort(plotCmp)
    .map((plot) => ({
      plot,
      chemical: ((s.manuring[plot] || [])[ri] || [])
        .map((on, ci) => (on ? dose(mCfg[ci] && mCfg[ci].name, mCfg[ci] && mCfg[ci].dose, mCfg[ci] && mCfg[ci].unit) : ''))
        .filter(Boolean)
        .join(' + '),
    }));

  // ── Weeding — two rounds only, and nothing is sprayed ──
  const wKey = ['R1', 'R2'][ri];
  out.weeding = !wKey ? [] : Object.keys(s.weeding || {})
    .filter((plot) => s.weeding[plot] && s.weeding[plot][wKey])
    .sort(plotCmp)
    .map((plot) => ({ plot, chemical: '' }));

  // ── Inter-row spraying ──
  const iCfg = (s.interrowConfig || [])[ri] || [];
  out.interrow = Object.keys(s.interrow || {})
    .filter((plot) => ((s.interrow[plot] || [])[ri] || []).some(Boolean))
    .sort(plotCmp)
    .map((plot) => ({
      plot,
      chemical: ((s.interrow[plot] || [])[ri] || [])
        .map((on, ci) => {
          if (!on || !iCfg[ci]) return '';
          const c = iCfg[ci];
          return [dose(c.chem, c.chem_dose, c.chem_unit),
                  dose('Activator', c.activator_dose, c.activator_unit)]
            .filter(Boolean).join(' + ');
        })
        .filter(Boolean)
        .join(' + '),
    }));

  return out;
}

/** B2 before B10, the way the nursery says them. */
function plotCmp(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10);
  const nb = parseInt(String(b).replace(/\D/g, ''), 10);
  const pa = String(a).replace(/[0-9]/g, '');
  const pb = String(b).replace(/[0-9]/g, '');
  return pa.localeCompare(pb) || (na - nb) || String(a).localeCompare(String(b));
}

/** How many plots each job covers in a week — the badge on the timeline. */
export function weekCounts(payload, week) {
  const tasks = weekTasks(payload, week);
  return Object.keys(tasks).reduce((acc, k) => { acc[k] = tasks[k].length; return acc; }, {});
}

/**
 * Has this plot's job already been recorded for this week?
 * Matched on the month's week rather than the exact day, because the schedule
 * asks for the job once in the block, not on a particular date.
 */
export function isDone(records, { workTypeKey, plot, week, month }) {
  return (records || []).some(
    (r) =>
      r.work_type === workTypeKey &&
      r.plot_name === plot &&
      (r.week_no ? r.week_no === week : weekOfDate(r.work_date) === week) &&
      monthLabelOf(r.work_date) === month
  );
}
