import { useMemo, useState } from 'react';
import { ACTIVITIES, INCENTIVE, NURSERIES, activityByN, prettyD, todayStr } from './data.js';
import { buildCullingReport, cullingReportFileName } from './cullingReport.js';
import {
  FIRST_ACT,
  LAST_ACT,
  idealSpan,
  perActivityStats,
  TARGET_DAYS,
  incentiveRuns,
  monthsWithData,
  perUnitStats,
  spanStats,
  unitsOf,
} from './motion.js';

// Motion Study — what the work actually costs in days, taken from the logs of
// all 52 plots rather than from the ideal-day table.
//
// Read one cycle at a time: Saringan Anak Bibit through to Pengambilan is one
// intake worked from start to sale, and each cycle contributes one figure per
// activity. Shortest and longest across every cycle is what a motion study is
// after — the ideal sits beside them so the gap is visible.

function Cell({ v, label, tone }) {
  return (
    <td className="px-2 sm:px-4 py-2 sm:py-3 align-top">
      {v == null ? (
        <span className="text-slate-300 font-bold">—</span>
      ) : (
        <>
          <div className={`font-black tabular-nums text-[13px] ${tone}`}>{v}</div>
          {label && <div className="text-[9px] font-bold text-slate-400 truncate">{label}</div>}
        </>
      )}
    </td>
  );
}

// Culling Duration measures one fixed run and nothing else.
const CULL_FROM = FIRST_ACT; // Saringan Anak Bibit
const CULL_TO = 9; // Transplanting

// '2026-08' -> 'Aug 2026'. Built from a fixed day so the month never slips
// across a timezone boundary.
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 15).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function MotionTab({ db, t, nurseryKeys, staffName }) {
  const [nursery, setNursery] = useState('all');
  const [from, setFrom] = useState(FIRST_ACT);
  const [to, setTo] = useState(LAST_ACT);
  // 'act' = by activity, 'plot' = by plot, 'pay' = who earned the incentive
  const [view, setView] = useState('act');
  const [month, setMonth] = useState(''); // '' = every month
  const [act, setAct] = useState(FIRST_ACT); // the activity the 'act' view is on

  // "All nurseries" means all the ones this user may see, not every nursery
  // in the database.
  const scope = nursery === 'all' ? nurseryKeys : nursery;
  // Each view measures its own thing, and none of them share a picker: By
  // activity is one activity, Culling Duration is the fixed Saringan ->
  // Transplanting run, By plot is whatever run is picked for it.
  const runFrom = view === 'pay' ? CULL_FROM : view === 'act' ? act : from;
  const runTo = view === 'pay' ? CULL_TO : view === 'act' ? act : to;

  const rows = useMemo(() => perActivityStats(db, scope, month), [db, scope, month]);
  const span = useMemo(
    () => spanStats(db, scope, runFrom, runTo, month),
    [db, scope, runFrom, runTo, month]
  );
  const plotRows = useMemo(
    () => (view === 'plot' ? perUnitStats(db, scope, runFrom, runTo, month) : []),
    [view, db, scope, runFrom, runTo, month]
  );
  const runs = useMemo(
    () => (view === 'pay' ? incentiveRuns(db, scope, runFrom, runTo, month) : []),
    [view, db, scope, runFrom, runTo, month]
  );
  const months = useMemo(() => monthsWithData(db, scope), [db, scope]);
  const units = useMemo(() => unitsOf(db, scope).length, [db, scope]);
  const ideal = idealSpan(runFrom, runTo);
  const measured = rows.reduce((s, r) => s + (r.stats ? r.stats.n : 0), 0);

  // Keep the run pointing forwards: choosing an end before the start pulls the
  // other end along rather than showing an empty result.
  const pickFrom = (n) => {
    setFrom(n);
    if (n > to) setTo(n);
  };
  const pickTo = (n) => {
    setTo(n);
    if (n < from) setFrom(n);
  };

  // The paper trail behind a payout: the same rows on screen, on letterhead,
  // with the rules printed underneath so a reader can check them.
  function makeReport() {
    const scope = {
      nursery: nursery === 'all' ? t('pm.allNurseries') : NURSERIES[nursery].label,
      month: month ? monthLabel(month) : t('ms.allMonths'),
      targetDays: TARGET_DAYS,
      minAreaPct: INCENTIVE.minAreaPct,
      runLabel: `${activityByN(CULL_FROM).name} - ${activityByN(CULL_TO).name}`,
      printedOn: todayStr(),
      by: staffName,
    };
    buildCullingReport(runs, scope).save(cullingReportFileName(scope));
  }

  const select = (value, onPick) => (
    <select
      value={value}
      onChange={(e) => onPick(Number(e.target.value))}
      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-[12px] font-bold text-slate-800 outline-none focus:border-emerald-500"
    >
      {/* The short label, so the whole option is readable inside a phone's
          half-width select rather than cut off mid-word. */}
      {ACTIVITIES.map((a) => (
        <option key={a.n} value={a.n}>
          {a.n}. {a.mShort}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {/* Header + the two filters: which nursery, and which month the work
          finished in. Only months with a finished measurement are offered. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-black text-slate-800 text-[15px]">{t('ms.title')}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={nursery}
            onChange={(e) => setNursery(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
          >
            <option value="all">{t('pm.allNurseries')}</option>
            {nurseryKeys.map((k) => (
              <option key={k} value={k}>
                {NURSERIES[k].label}
              </option>
            ))}
          </select>
          <select
            value={months.includes(month) ? month : ''}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
          >
            <option value="">{t('ms.allMonths')}</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Which way the study is cut. By activity answers "how long does
          culling take"; by plot answers "which plots are slow". */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-1.5 sm:p-2 flex gap-1.5 sm:gap-2">
        {[
          ['act', t('ms.byActivity')],
          ['plot', t('ms.byPlot')],
          ['pay', t('ms.incentive')],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-xl px-2 py-2.5 text-[11px] sm:text-[12px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
              view === id
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* A run of activities — the whole cycle by default */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
            {view === 'pay'
              ? t('ms.cullRun')
              : view === 'act'
                ? t('ms.oneActivity')
                : t('ms.spanTitle')}
          </h3>
        </div>
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          {/* By activity picks one activity — a from/until pair asked a
              question it does not have. Culling Duration is one fixed run, so
              it picks nothing at all. */}
          {/* The eleven activities as tiles, the way the Monitoring Board's
              stage flow reads: a row of buttons carrying their own figure,
              rather than a dropdown you have to open to see what is there.
              Each tile shows that activity's average, so the slow stages are
              visible before you pick one. */}
          {view === 'act' && (
            <div className="-mx-4 sm:-mx-6 overflow-x-auto px-4 sm:px-6">
              <div className="flex gap-2 min-w-[760px]">
                {ACTIVITIES.map((a) => {
                  const st = rows.find((r) => r.act.n === a.n).stats;
                  const on = act === a.n;
                  return (
                    <button
                      key={a.n}
                      onClick={() => setAct(a.n)}
                      className={`flex-1 px-1.5 py-2.5 text-center rounded-xl border-2 transition-all cursor-pointer hover:-translate-y-0.5 ${
                        on
                          ? 'bg-emerald-50 border-emerald-500'
                          : 'bg-slate-50 border-slate-200 hover:border-emerald-400 hover:bg-white'
                      }`}
                    >
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-tight min-h-[24px]">
                        {a.short}
                      </div>
                      <div
                        className={`text-lg font-black tabular-nums ${
                          on ? 'text-emerald-700' : st ? 'text-slate-800' : 'text-slate-300'
                        }`}
                      >
                        {st ? st.avg : '—'}
                      </div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                        {t('ms.days')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {view === 'plot' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  {t('ms.from')}
                </span>
                {select(from, pickFrom)}
              </label>
              <label className="min-w-0">
                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  {t('ms.to')}
                </span>
                {select(to, pickTo)}
              </label>
            </div>
          )}

          {span ? (
            <>
              <div className={`grid grid-cols-3 gap-2 ${view === 'pay' ? '' : 'mt-3'}`}>
                {[
                  ['ms.fastest', span.min, 'text-emerald-600'],
                  ['ms.average', { days: span.avg }, 'text-slate-800'],
                  ['ms.slowest', span.max, 'text-rose-600'],
                ].map(([k, s, tone]) => (
                  <div key={k} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-w-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t(k)}</div>
                    <div className={`text-xl font-black tabular-nums ${tone}`}>{s.days}</div>
                    <div className="text-[10px] font-bold text-slate-400 truncate">
                      {s.label ? s.label : t('ms.days')}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-bold text-slate-500 mt-2.5">
                {t('ms.spanFoot', { ideal })}
              </p>
            </>
          ) : (
            <p className="text-[12px] font-semibold text-slate-400 mt-3">{t('ms.spanEmpty')}</p>
          )}
        </div>
      </div>

      {/* Incentive: every completed run listed, fastest first, with both dates
          on the row. A run that started in July and finished in August is
          visibly an August run rather than something you have to take on
          trust from the month filter. */}
      {view === 'pay' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
              {t('ms.incentiveTitle', { d: TARGET_DAYS })}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black text-emerald-700">
                {t('ms.qualifiedCount', { n: runs.filter((r) => r.qualified).length, total: runs.length })}
              </span>
              <button
                onClick={makeReport}
                className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider rounded-xl px-3 py-2 cursor-pointer"
              >
                {t('ms.report')}
              </button>
            </div>
          </div>
          {runs.length === 0 ? (
            <p className="px-4 sm:px-6 py-6 text-[12px] font-semibold text-slate-400">{t('ms.spanEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">Plot</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.started')}</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.finished')}</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.days')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr
                    key={`${r.key}-${r.end}-${i}`}
                    className={`border-t border-slate-100 ${r.qualified ? 'bg-emerald-50/50' : ''}`}
                  >
                    {/* The verdict sits under the plot rather than in a fifth
                        column: it is the column that matters most, and on a
                        phone a fifth column is the one that falls off the
                        edge. */}
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="font-black text-slate-700 text-[12px] leading-tight">{r.label}</div>
                      {r.area && (
                        <div
                          className={`text-[9px] font-bold ${r.entitled ? 'text-slate-400' : 'text-rose-500'}`}
                        >
                          {t('ms.areaShare', { p: r.pct })}
                        </div>
                      )}
                      {r.qualified ? (
                        <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
                          {t('ms.earns')}
                        </span>
                      ) : !r.entitled && r.withinTarget ? (
                        <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-black border bg-rose-50 text-rose-600 border-rose-200 whitespace-nowrap">
                          {t('ms.tooSmall')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                      {prettyD(r.start)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                      {prettyD(r.end)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span
                        // Green inside the target, red outside it: the whole
                        // point of the list is which side of 15 days a run
                        // fell, so grey said too little.
                        className={`font-black tabular-nums text-[14px] ${
                          r.withinTarget ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {r.days}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 sm:px-6 py-2.5 sm:py-3.5 text-[10px] font-semibold text-slate-400 border-t border-slate-100">
            {t('ms.incentiveNote', { d: TARGET_DAYS, p: INCENTIVE.minAreaPct })}
          </p>
        </div>
      )}

      {/* By plot: the same run, split by plot, slowest first */}
      {view === 'plot' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.perPlotTitle')}</h3>
            <span className="text-[11px] font-bold text-slate-400">{t('ms.slowestFirst')}</span>
          </div>
          {plotRows.length === 0 ? (
            <p className="px-4 sm:px-6 py-6 text-[12px] font-semibold text-slate-400">{t('ms.spanEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">Plot</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.min')}</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.max')}</th>
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {plotRows.map(({ key, label, stats }) => (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 align-top">
                      <div className="font-black text-slate-700 text-[12px] leading-tight">{label}</div>
                      <div className="text-[9px] font-bold text-slate-400">{t('ms.cycles', { n: stats.n })}</div>
                    </td>
                    <Cell v={stats.min.days} tone="text-emerald-600" />
                    <Cell v={stats.max.days} tone="text-rose-600" />
                    <Cell v={stats.avg} tone="text-slate-800" />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* By activity: each activity on its own, across every plot */}
      {view === 'act' && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.perActTitle')}</h3>
          <span className="text-[11px] font-bold text-slate-400">{t('ms.measured', { n: measured, u: units })}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('pm.colActivity')}</th>
              <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.min')}</th>
              <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.max')}</th>
              <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.avg')}</th>
              <th className="px-2 py-2.5 hidden sm:table-cell">{t('ms.ideal')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ act, stats }) => (
              <tr key={act.n} className="border-t border-slate-100">
                <td className="px-2 sm:px-4 py-2 sm:py-3 align-top">
                  <div className="font-black text-slate-700 text-[12px] leading-tight">
                    <span className="sm:hidden">{act.mShort}</span>
                    <span className="hidden sm:inline">{act.name}</span>
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">
                    {stats ? t('ms.cycles', { n: stats.n }) : t('ms.noData')}
                  </div>
                </td>
                <Cell v={stats && stats.min.days} label={stats && stats.min.label} tone="text-emerald-600" />
                <Cell v={stats && stats.max.days} label={stats && stats.max.label} tone="text-rose-600" />
                <Cell v={stats && stats.avg} tone="text-slate-800" />
                <td className="px-2 sm:px-4 py-2 sm:py-3 align-top hidden sm:table-cell">
                  <div className="font-black tabular-nums text-[13px] text-slate-400">{act.days}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

    </>
  );
}
