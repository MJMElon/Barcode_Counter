import { useEffect, useMemo, useState } from 'react';
import { ACTIVITIES, INCENTIVE, NURSERIES, keyLabel, nurseryOfPlot, prettyD, todayStr } from './data.js';
import { buildCullingReport, cullingReportFileName } from './cullingReport.js';
import {
  FIRST_ACT,
  TARGET_DAYS,
  activityStats,
  incentiveRuns,
  monthsWithData,
  perUnitActivityStats,
  unitActivityStats,
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

const NUR_ORDER = { BNN: 0, UNN1: 1, UNN2: 2 };

// A picker tile. Fixed height, not one that follows the label: the grid gives
// them equal widths, and without this a two-line name makes its row taller
// than the row beneath it.
const tile = (on) =>
  `px-2 min-h-[56px] flex items-center justify-center text-center rounded-xl border-2 transition-all cursor-pointer hover:-translate-y-0.5 ${
    on
      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-400 hover:bg-white'
  }`;

// Culling Duration measures one fixed run and nothing else.
const CULL_FROM = FIRST_ACT; // Saringan Anak Bibit
const CULL_TO = 9; // Transplanting

// '2026-08' -> 'Aug 2026'. Built from a fixed day so the month never slips
// across a timezone boundary.
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 15).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/* ================= REPORT DIALOG =================
   The report is a document somebody signs, so what goes on it is decided
   here rather than inherited from whatever the page happened to be filtered
   to: which nursery, which month, who prepared it, and which plots belong on
   it. Everything is included until it is unticked — a report that starts
   empty invites a half-filled one. */
function ReportDialog({ db, t, nurseryKeys, months, initial, staffName, onGenerated, onClose }) {
  const [nursery, setNursery] = useState(initial.nursery);
  const [month, setMonth] = useState(initial.month);
  const [by, setBy] = useState(staffName || '');
  const [dropped, setDropped] = useState(() => new Set());

  const scope = nursery === 'all' ? nurseryKeys : nursery;
  const runs = useMemo(
    () => incentiveRuns(db, scope, CULL_FROM, CULL_TO, month),
    [db, scope, month]
  );

  // One row per plot, however many runs it had in the period.
  const plots = useMemo(() => {
    const by = new Map();
    runs.forEach((r) => {
      const cur = by.get(r.key) || { key: r.key, label: r.label, n: 0, earned: 0 };
      cur.n += 1;
      if (r.qualified) cur.earned += 1;
      by.set(r.key, cur);
    });
    return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [runs]);

  // Changing nursery or month changes the list, so start it fully ticked
  // again rather than carrying exclusions across to different plots.
  useEffect(() => setDropped(new Set()), [nursery, month]);

  const toggle = (key) =>
    setDropped((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const kept = runs.filter((r) => !dropped.has(r.key));

  function generate() {
    const s = {
      nursery: nursery === 'all' ? t('pm.allNurseries') : NURSERIES[nursery].label,
      month: month ? monthLabel(month) : t('ms.allMonths'),
      targetDays: TARGET_DAYS,
      printedOn: todayStr(),
      by: by.trim(),
    };
    buildCullingReport(kept, s).save(cullingReportFileName(s));
    // Tell the page what was just judged, so the list behind this dialog can
    // show the verdict for that nursery and month — and only that one.
    onGenerated(`${nursery}|${month}`);
    onClose();
  }

  const field =
    'w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <h3 className="flex-1 font-black text-slate-800 text-[15px]">{t('ms.reportTitle')}</h3>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                {t('pm.nursery')}
              </span>
              <select value={nursery} onChange={(e) => setNursery(e.target.value)} className={field}>
                <option value="all">{t('pm.allNurseries')}</option>
                {nurseryKeys.map((k) => (
                  <option key={k} value={k}>
                    {NURSERIES[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                {t('ms.month')}
              </span>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={field}>
                <option value="">{t('ms.allMonths')}</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {t('ms.preparedBy')}
            </span>
            <input value={by} onChange={(e) => setBy(e.target.value)} className={field} />
          </label>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {t('ms.pickPlots')}
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setDropped(new Set())}
                  className="text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:underline cursor-pointer"
                >
                  {t('ms.selectAll')}
                </button>
                <button
                  onClick={() => setDropped(new Set(plots.map((p) => p.key)))}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:underline cursor-pointer"
                >
                  {t('ms.selectNone')}
                </button>
              </span>
            </div>

            {plots.length === 0 ? (
              <p className="text-[12px] font-semibold text-slate-400 py-3">{t('ms.spanEmpty')}</p>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[34vh] overflow-y-auto">
                {plots.map((p) => {
                  const on = !dropped.has(p.key);
                  return (
                    <button
                      key={p.key}
                      onClick={() => toggle(p.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer ${
                        on ? 'bg-white' : 'bg-slate-50'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-5 h-5 rounded-md grid place-items-center text-[11px] font-black border-2 ${
                          on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300'
                        }`}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className={`flex-1 min-w-0 text-[12px] font-black ${on ? 'text-slate-800' : 'text-slate-400'}`}>
                        {p.label}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {t('ms.runsN', { n: p.n })}
                        {p.earned > 0 && <span className="text-emerald-600"> · {t('ms.earnedN', { n: p.earned })}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-500 text-center mb-2">
            {t('ms.reportCount', {
              n: kept.length,
              e: kept.filter((r) => r.qualified).length,
            })}
          </p>
          <button
            onClick={generate}
            disabled={!kept.length}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3 cursor-pointer"
          >
            {t('ms.generate')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MotionTab({ db, t, nurseryKeys, staffName }) {
  const [nursery, setNursery] = useState('all');
  // 'act' = by activity, 'plot' = by plot, 'pay' = who earned the incentive
  const [view, setView] = useState('act');
  const [month, setMonth] = useState(''); // '' = every month
  const [act, setAct] = useState(FIRST_ACT); // the activity the 'act' view is on
  const [unit, setUnit] = useState(null); // the plot the 'plot' view is on
  const [reporting, setReporting] = useState(false);
  // Which nursery and month a report has actually been generated for.
  //
  // Earning the incentive is a decision the report makes, not something the
  // list knows on its own. Until Generate has been pressed nobody has been
  // paid or refused, so the screen shows the runs and their days and leaves
  // the verdict blank rather than announcing an outcome no document backs up.
  // Keyed to the scope that was reported: change nursery or month and the
  // marks go again, because last month's payout says nothing about this
  // month's runs.
  const [reportedFor, setReportedFor] = useState(null);

  // "All nurseries" means all the ones this user may see, not every nursery
  // in the database.
  const scope = nursery === 'all' ? nurseryKeys : nursery;
  // By activity and By plot answer the same question two ways — how long does
  // this activity take, pooled or plot by plot — so they share one picker and
  // one definition of "how long". Culling Duration is the fixed Saringan ->
  // Transplanting run, measured as a span, which is a different thing.
  // The two views are mirrors. By activity holds an activity still and varies
  // the plot; By plot holds a plot still and varies the activity. Each picks
  // its subject in the first card and lists the other in the second.
  const units = useMemo(
    () =>
      unitsOf(db, scope).sort((a, b) => {
        const [pa, aa = ''] = a.split('#');
        const [pb, ab = ''] = b.split('#');
        const na = NUR_ORDER[nurseryOfPlot(pa)] ?? 9;
        const nb = NUR_ORDER[nurseryOfPlot(pb)] ?? 9;
        if (na !== nb) return na - nb;
        const da = parseInt(pa.replace(/\D/g, ''), 10);
        const dbn = parseInt(pb.replace(/\D/g, ''), 10);
        if (da !== dbn) return da - dbn;
        return aa.localeCompare(ab);
      }),
    [db, scope]
  );
  // A nursery the picked plot does not belong to leaves the choice stranded.
  const pickedUnit = unit && units.includes(unit) ? unit : units[0] || null;

  const span = useMemo(() => activityStats(db, scope, act, month), [db, scope, act, month]);
  const plotRows = useMemo(
    () => (view === 'act' ? perUnitActivityStats(db, scope, act, month) : []),
    [view, db, scope, act, month]
  );
  const actRows = useMemo(
    () => (view === 'plot' && pickedUnit ? unitActivityStats(db, pickedUnit, month) : []),
    [view, db, pickedUnit, month]
  );
  const runs = useMemo(
    () => (view === 'pay' ? incentiveRuns(db, scope, CULL_FROM, CULL_TO, month) : []),
    [view, db, scope, month]
  );
  const months = useMemo(() => monthsWithData(db, scope), [db, scope]);
  const judged = reportedFor === `${nursery}|${month}`;
  const ideal = ACTIVITIES.find((a) => a.n === act).days;

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

      {/* What the view is about: an activity, or a plot. Culling Duration is
          neither — it is a fixed run and picks nothing. */}
      {view !== 'pay' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
              {view === 'act' ? t('ms.oneActivity') : t('ms.plotsTitle')}
            </h3>
          </div>
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            {/* Tiles rather than a dropdown you have to open to see what is in
                it, wrapped rather than squeezed into one scrolling line, and
                every tile the same size so the block reads as one set. */}
            {view === 'act' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {ACTIVITIES.map((a) => (
                  <button
                    key={a.n}
                    onClick={() => setAct(a.n)}
                    className={tile(act === a.n)}
                  >
                    <span className="text-[12px] font-black leading-tight">{a.short}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                {units.map((k) => (
                  <button key={k} onClick={() => setUnit(k)} className={tile(pickedUnit === k)}>
                    <span className="text-[12px] font-black leading-tight">{keyLabel(k)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* The chosen activity's figures pooled across every plot. A plot
                has eleven activities and no single pair of numbers, so By plot
                goes straight to its table. */}
            {view === 'act' &&
              (span ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      ['ms.fastest', span.min, 'text-emerald-600'],
                      ['ms.average', { days: span.avg }, 'text-slate-800'],
                      ['ms.slowest', span.max, 'text-rose-600'],
                    ].map(([k, v, tone]) => (
                      <div key={k} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t(k)}</div>
                        <div className={`text-xl font-black tabular-nums ${tone}`}>{v.days}</div>
                        <div className="text-[10px] font-bold text-slate-400 truncate">
                          {v.label ? v.label : t('ms.days')}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 mt-2.5">{t('ms.spanFoot', { ideal })}</p>
                </>
              ) : (
                <p className="text-[12px] font-semibold text-slate-400 mt-3">{t('ms.spanEmpty')}</p>
              ))}
          </div>
        </div>
      )}

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
                onClick={() => setReporting(true)}
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
                    className={`border-t border-slate-100 ${judged && r.qualified ? 'bg-emerald-50/50' : ''}`}
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
                      {/* Earned or not, the same tick and cross the report
                          prints — but only once that report exists. The area
                          share above already says why a run inside the target
                          still missed. */}
                      {judged && (
                        <span
                          className={`block mt-0.5 text-[15px] font-black leading-none ${
                            r.qualified ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                          title={r.qualified ? t('ms.earns') : t('ms.notEarned')}
                        >
                          {r.qualified ? '✓' : '✗'}
                        </span>
                      )}
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

      {reporting && (
        <ReportDialog
          db={db}
          t={t}
          nurseryKeys={nurseryKeys}
          months={months}
          initial={{ nursery, month }}
          staffName={staffName}
          onGenerated={setReportedFor}
          onClose={() => setReporting(false)}
        />
      )}

      {/* By activity, section two: the chosen activity plot by plot */}
      {view === 'act' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.plotsTitle')}</h3>
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

      {/* By plot, section two: every activity for the chosen plot */}
      {view === 'plot' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
              {t('ms.oneActivity')}
            </h3>
            <span className="text-[11px] font-bold text-slate-400">{pickedUnit ? keyLabel(pickedUnit) : '—'}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('pm.colActivity')}</th>
                <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.min')}</th>
                <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.max')}</th>
                <th className="px-2 sm:px-4 py-2.5 sm:py-3.5">{t('ms.avg')}</th>
                <th className="px-2 sm:px-4 py-2.5 sm:py-3.5 hidden sm:table-cell">{t('ms.ideal')}</th>
              </tr>
            </thead>
            <tbody>
              {actRows.map(({ act: a, stats }) => (
                <tr key={a.n} className="border-t border-slate-100">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 align-top">
                    <div className="font-black text-slate-700 text-[12px] leading-tight">
                      <span className="sm:hidden">{a.mShort}</span>
                      <span className="hidden sm:inline">{a.name}</span>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400">
                      {stats ? t('ms.cycles', { n: stats.n }) : t('ms.noData')}
                    </div>
                  </td>
                  <Cell v={stats && stats.min.days} tone="text-emerald-600" />
                  <Cell v={stats && stats.max.days} tone="text-rose-600" />
                  <Cell v={stats && stats.avg} tone="text-slate-800" />
                  <td className="px-2 sm:px-4 py-2 sm:py-3 align-top hidden sm:table-cell">
                    <div className="font-black tabular-nums text-[13px] text-slate-400">{a.days}</div>
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
