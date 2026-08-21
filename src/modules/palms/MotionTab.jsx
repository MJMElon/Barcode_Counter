import { useMemo, useState } from 'react';
import { ACTIVITIES, NURSERIES } from './data.js';
import {
  FIRST_ACT,
  LAST_ACT,
  idealSpan,
  perActivityStats,
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
    <td className="px-2 py-2 align-top">
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

export default function MotionTab({ db, t, nurseryKeys }) {
  const [nursery, setNursery] = useState('all');
  const [from, setFrom] = useState(FIRST_ACT);
  const [to, setTo] = useState(LAST_ACT);
  const [view, setView] = useState('act'); // 'act' = by activity, 'plot' = by plot

  // "All nurseries" means all the ones this user may see, not every nursery
  // in the database.
  const scope = nursery === 'all' ? nurseryKeys : nursery;
  const rows = useMemo(() => perActivityStats(db, scope), [db, scope]);
  const span = useMemo(() => spanStats(db, scope, from, to), [db, scope, from, to]);
  const plotRows = useMemo(
    () => (view === 'plot' ? perUnitStats(db, scope, from, to) : []),
    [view, db, scope, from, to]
  );
  const units = useMemo(() => unitsOf(db, scope).length, [db, scope]);
  const ideal = idealSpan(from, to);
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
      {/* Header + nursery filter */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-black text-slate-800 text-[15px]">{t('ms.title')}</h2>
          <div className="text-[11px] font-semibold text-slate-400">{t('ms.lede')}</div>
        </div>
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
      </div>

      {/* Which way the study is cut. By activity answers "how long does
          culling take"; by plot answers "which plots are slow". */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-1.5 flex gap-1.5">
        {[
          ['act', t('ms.byActivity')],
          ['plot', t('ms.byPlot')],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
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
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.spanTitle')}</h3>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{t('ms.spanHint')}</p>
        </div>
        <div className="px-4 py-3">
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

          {span ? (
            <>
              <div className="grid grid-cols-3 gap-2 mt-3">
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
                {t('ms.spanFoot', { n: span.n, ideal })}
              </p>
            </>
          ) : (
            <p className="text-[12px] font-semibold text-slate-400 mt-3">{t('ms.spanEmpty')}</p>
          )}
        </div>
      </div>

      {/* By plot: the same run, split by plot, slowest first */}
      {view === 'plot' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.perPlotTitle')}</h3>
            <span className="text-[11px] font-bold text-slate-400">{t('ms.slowestFirst')}</span>
          </div>
          {plotRows.length === 0 ? (
            <p className="px-4 py-6 text-[12px] font-semibold text-slate-400">{t('ms.spanEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-2 py-2.5">Plot</th>
                  <th className="px-2 py-2.5">{t('ms.min')}</th>
                  <th className="px-2 py-2.5">{t('ms.max')}</th>
                  <th className="px-2 py-2.5">{t('ms.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {plotRows.map(({ key, label, stats }) => (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="px-2 py-2 align-top">
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
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('ms.perActTitle')}</h3>
          <span className="text-[11px] font-bold text-slate-400">{t('ms.measured', { n: measured, u: units })}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <th className="px-2 py-2.5">{t('pm.colActivity')}</th>
              <th className="px-2 py-2.5">{t('ms.min')}</th>
              <th className="px-2 py-2.5">{t('ms.max')}</th>
              <th className="px-2 py-2.5">{t('ms.avg')}</th>
              <th className="px-2 py-2.5 hidden sm:table-cell">{t('ms.ideal')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ act, stats }) => (
              <tr key={act.n} className="border-t border-slate-100">
                <td className="px-2 py-2 align-top">
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
                <td className="px-2 py-2 align-top hidden sm:table-cell">
                  <div className="font-black tabular-nums text-[13px] text-slate-400">{act.days}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <p className="text-[10px] font-semibold text-slate-400 text-center px-2">{t('ms.foot')}</p>
    </>
  );
}
