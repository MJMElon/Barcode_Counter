/**
 * The period's to-do list: what the office asked for, and what is already done.
 *
 * Pure — no React, no imports beyond the schedule reader — so the question
 * "why is this job on my list" can be answered in plain node.
 *
 * A PERIOD is the office's own week block: 1st–7th, 8th–14th, 15th–21st,
 * 22nd–end. It is not a rolling seven days, because the schedule is not: the
 * office ticks a plot for week 2 and means the 8th to the 14th, so a list that
 * showed "the next seven days" would show half of one block and half of the
 * next and match neither the plan nor the record.
 */
import { WORK_TYPES } from '../modules/maintenance/helpers.js';
import { isDone, mergeWeekTasks } from '../modules/maintenance/schedule.js';

/** A job's identity: the plot AND what is going on it. */
export const idOf = (t) => `${t.workTypeKey}|${t.plot}|${t.chemical || ''}`;

/**
 * Every job due in one week, flat and in one list.
 *
 * The FC Portal groups by work type, because a Field Conductor plans a
 * morning: all the spraying, then all the manuring. A worker is handed a list
 * and works down it, so the grouping is one thing between them and the first
 * job. Ordered by plot instead, so a worker walking B1 → B2 → B3 does the two
 * jobs on B1 while standing in it.
 *
 * `plotFilter` is the plot half of a boundary. A worker allowed four plots out
 * of nine must not be handed the other five as work — the database would
 * refuse the record, and only after they had walked it.
 */
export function periodTasks(schedule, week, { plotFilter = null } = {}) {
  const byType = mergeWeekTasks(schedule, week);
  const out = [];
  WORK_TYPES.forEach((wt) => {
    (byType[wt.key] || []).forEach((task) => {
      if (plotFilter && !plotFilter(task.plot)) return;
      out.push({
        id: idOf({ workTypeKey: wt.key, plot: task.plot, chemical: task.chemical }),
        workTypeKey: wt.key,
        plot: task.plot,
        chemical: task.chemical || '',
        nursery: task.nursery || null,
        side: task.side || null,
      });
    });
  });
  /* Plot first, then the order the work types are declared in — which is the
     order the office's own screen lists them, so two lists of the same week
     read the same way. */
  const rank = (k) => WORK_TYPES.findIndex((w) => w.key === k);
  /* P before D on the same plot — the pest spray then the disease spray, the
     order the office ticks them in. Sorted on the chemical instead, Antracol
     came before Decis and the two rows read back to front. */
  const sideRank = (s) => (s === 'P' ? 0 : s === 'D' ? 1 : 2);
  return out.sort((a, b) =>
    String(a.plot).localeCompare(String(b.plot), undefined, { numeric: true })
    || rank(a.workTypeKey) - rank(b.workTypeKey)
    || sideRank(a.side) - sideRank(b.side)
    || String(a.chemical).localeCompare(String(b.chemical)));
}

/**
 * The same list, split by whether it has been recorded.
 *
 * `records` must already include whatever the outbox is still holding — a job
 * done in a plot with no signal is DONE, and showing it as outstanding is how
 * it gets done twice.
 */
export function splitDone(tasks, records, { week, month }) {
  const todo = [];
  const done = [];
  (tasks || []).forEach((task) => {
    const d = isDone(records, {
      workTypeKey: task.workTypeKey, plot: task.plot,
      chemical: task.chemical, week, month,
    });
    (d ? done : todo).push(task);
  });
  return { todo, done };
}

/**
 * "1 Aug – 7 Aug", from the week number and the month the office filed it
 * under. The FC Portal says "1st - 7th" beside a month heading that is already
 * on screen; here the period IS the screen, so it carries its own month.
 */
export function periodLabel(week, monthLbl, days) {
  const from = (week - 1) * 7 + 1;
  if (!days || from > days) return monthLbl || '';
  const to = week === 4 ? days : Math.min(from + 6, days);
  const mon = String(monthLbl || '').split(/\s+/)[0] || '';
  return `${from} ${mon} – ${to} ${mon}`;
}
