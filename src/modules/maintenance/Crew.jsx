import { useMemo } from 'react';
import { WORK_TYPES } from './helpers.js';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/*
 * Who did the month's work.
 *
 * The Field Conductor's half of the arrangement: workers record what they did
 * from the Worker Portal, and this is where their conductor sees it — one row
 * per person, what they recorded, and how much.
 *
 * The row that matters most is the empty one. A list of who HAS recorded is
 * only half a supervisor's question; the other half is who has not, and a
 * panel built only from the records themselves could never show it. So the
 * crew comes from the payroll register and the records are matched onto it,
 * which means somebody who has done nothing all month is a row saying so
 * rather than an absence nobody notices.
 *
 * Anyone who recorded work but is not on the crew list — a conductor covering
 * a shift, a worker who has since left — is kept under "Others" rather than
 * dropped, so the totals here and the list below always agree.
 */

const nameKey = (s) => String(s == null ? '' : s).trim().toLowerCase();

export default function Crew({ crew, records, nursery, onPick, picked, t }) {
  /* One row per person: the crew for this nursery, plus anyone who recorded
     work here without being on it. */
  const rows = useMemo(() => {
    const byName = new Map();
    const put = (name, extra) => {
      const k = nameKey(name);
      if (!k) return null;
      if (!byName.has(k)) {
        byName.set(k, { key: k, name, jobs: [], onCrew: false, worker_no: null, ...extra });
      } else if (extra) {
        Object.assign(byName.get(k), extra);
      }
      return byName.get(k);
    };

    (crew || [])
      .filter((w) => !nursery || nameKey(w.nursery) === nameKey(nursery))
      .forEach((w) => put(w.full_name, { onCrew: true, worker_no: w.worker_no }));

    (records || []).forEach((r) => {
      const row = put(r.reported_by);
      if (row) row.jobs.push(r);
    });

    const list = [...byName.values()];
    list.forEach((row) => {
      row.total = row.jobs.length;
      row.counts = WORK_TYPES.reduce((acc, wt) => {
        acc[wt.key] = row.jobs.filter((j) => j.work_type === wt.key).length;
        return acc;
      }, {});
      row.last = row.jobs.reduce(
        (d, j) => (j.work_date && j.work_date > d ? j.work_date : d), ''
      );
    });

    // Busiest first, then anyone who has recorded nothing, then off-crew.
    return list.sort(
      (a, b) =>
        Number(b.onCrew) - Number(a.onCrew) ||
        b.total - a.total ||
        a.name.localeCompare(b.name)
    );
  }, [crew, records, nursery]);

  if (!rows.length) return null;

  /* The tally is about the crew, so it counts the crew — anybody recording
     here who is not on it is shown, because their work is real and the list
     below must add up, but counting them would flatter the number. A
     conductor covering one plot himself turned "2 of 3 recorded" into
     "3 of 4", which reads better and says less. */
  const onCrew = rows.filter((r) => r.onCrew);
  const done = onCrew.filter((r) => r.total > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {t('mt.crew')}
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest tabular-nums">
          {t('mt.crewRecorded', { done, total: onCrew.length })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden divide-y divide-slate-100">
        {rows.map((row) => {
          const on = picked === row.key;
          return (
            <button
              key={row.key}
              onClick={() => onPick(on ? null : row.key)}
              className={`w-full text-left px-3.5 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
                on ? 'bg-emerald-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-black text-slate-800 text-[13.5px] leading-tight truncate">
                  {row.name}
                  {!row.onCrew && (
                    <span className="ml-2 text-[9.5px] font-black text-slate-400 uppercase tracking-wider">
                      {t('mt.crewOther')}
                    </span>
                  )}
                </div>

                {row.total ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {WORK_TYPES.filter((wt) => row.counts[wt.key]).map((wt) => (
                      <span
                        key={wt.key}
                        className={`inline-flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 ${tintOf(wt.key).bg}`}
                      >
                        <WorkIcon workKey={wt.key} className={`w-3.5 h-3.5 ${tintOf(wt.key).fg}`} />
                        <span className={`text-[10.5px] font-black tabular-nums ${tintOf(wt.key).fg}`}>
                          {row.counts[wt.key]}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  /* The whole reason this panel reads the payroll register
                     rather than the records. */
                  <div className="text-[11px] font-bold text-amber-700 mt-0.5">
                    {t('mt.crewNothing')}
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <div className="text-[15px] font-black text-slate-800 tabular-nums leading-none">
                  {row.total}
                </div>
                {row.worker_no && (
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    {row.worker_no}
                  </div>
                )}
              </div>
              <div className="text-slate-300 font-black shrink-0">{on ? '⌄' : '›'}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
