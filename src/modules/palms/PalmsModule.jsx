import { useMemo, useRef, useState } from 'react';
import CullingTab from './CullingTab.jsx';
import EntryTab from './EntryTab.jsx';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  ACTIVITIES,
  MULTI,
  NURSERIES,
  activityByN,
  addDays,
  historyOn,
  keyLabel,
  areasOf,
  combinedLabel,
  currentEntry,
  diffDays,
  effActivityName,
  effEstEnd,
  effStatus,
  freshDB,
  isMulti,
  loadDB,
  nurseryOfPlot,
  plotInActivity,
  plotsOf,
  prettyD,
  saveDB,
  seedSample,
  todayStr,
} from './data.js';

// PALMS — Plot Activity Log Monitoring System, ported from the standalone
// NurseryPALMS app into the portal: portal login and theme, EN/BM via the
// portal language toggle, data still offline on the device (localStorage).
// Three tabs: the daily status railway, the monitoring dashboard and the
// Culling Calculator.

const STATE_BADGE = {
  ontrack: 'bg-teal-50 text-teal-700 border-teal-200',
  soon: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  none: 'bg-slate-100 text-slate-400 border-slate-200',
};

export default function PalmsModule() {
  const { staffName } = useAuth();
  const { t } = useLang();

  // The DB is a plain mutable object persisted to localStorage; a tick
  // counter re-renders after each mutation (same pattern as the source app's
  // re-render calls). A device with no data yet gets randomly generated
  // stages (same generator as the "Isi data contoh" demo tool) so there is
  // something to check straight away.
  const dbRef = useRef(null);
  if (!dbRef.current) {
    let d = loadDB();
    if (!Object.keys(d.logs || {}).length) {
      d = seedSample();
      saveDB(d);
    }
    dbRef.current = d;
  }
  const db = dbRef.current;
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  const [tab, setTab] = useState('entry');
  const [toast, setToast] = useState(null);
  const flash = (msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 2500);
  };

  const stateLabel = (s) => t(`pm.state.${s}`);

  const [detail, setDetail] = useState(null); // plot id for the log modal
  const [mapPid, setMapPid] = useState(null); // plot id for the area-map modal

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title="PALMS" subtitle="FC Portal" user={staffName} back="/dashboard" />

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1000px] mx-auto px-3 sm:px-6 flex gap-1">
          {[
            ['entry', t('pm.tabEntry')],
            ['dash', t('pm.tabDash')],
            ['cull', t('cull.title')],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-[12px] font-black uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer ${
                tab === id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-3 sm:px-6 py-4 space-y-3">
        {tab === 'entry' ? (
          <EntryTab db={db} t={t} staffName={staffName} refresh={refresh} flash={flash} openMap={setMapPid} />
        ) : tab === 'cull' ? (
          <CullingTab t={t} staffName={staffName} flash={flash} />
        ) : (
          <DashTab
            db={db}
            t={t}
            stateLabel={stateLabel}
            refresh={refresh}
            flash={flash}
            openDetail={setDetail}
            replaceDB={(next) => {
              dbRef.current = next;
              saveDB(next);
              refresh();
            }}
          />
        )}
      </div>

      {detail && (
        <DetailModal db={db} pid={detail} t={t} onClose={() => setDetail(null)} openMap={setMapPid} />
      )}
      {mapPid && <AreaMapModal pid={mapPid} t={t} onClose={() => setMapPid(null)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ================= DASHBOARD TAB ================= */
function DashTab({ db, t, stateLabel, refresh, flash, openDetail, replaceDB }) {
  const [fNursery, setFNursery] = useState('all');
  const [filter, setFilter] = useState({ kind: 'all', val: null });
  const [onDate, setOnDate] = useState(''); // '' = no date filter

  const plots = useMemo(() => {
    const ks = fNursery === 'all' ? Object.keys(NURSERIES) : [fNursery];
    let ps = [];
    ks.forEach((k) => {
      ps = ps.concat(plotsOf(k));
    });
    return ps;
  }, [fNursery]);

  const counts = { total: plots.length, ontrack: 0, soon: 0, overdue: 0, none: 0 };
  plots.forEach((p) => counts[effStatus(db, p).state]++);

  const stageCounts = {};
  ACTIVITIES.forEach((a) => (stageCounts[a.n] = 0));
  plots.forEach((p) => {
    if (isMulti(p)) {
      MULTI[p].areas.forEach((a) => {
        const cur = currentEntry(db, `${p}#${a}`);
        if (cur) stageCounts[cur.actN]++;
      });
    } else {
      const cur = currentEntry(db, p);
      if (cur) stageCounts[cur.actN]++;
    }
  });
  const inProc = plots.filter((p) =>
    isMulti(p) ? MULTI[p].areas.some((a) => currentEntry(db, `${p}#${a}`)) : currentEntry(db, p)
  ).length;

  function toggleState(s) {
    setFilter((f) => (f.kind === 'state' && f.val === s ? { kind: 'all', val: null } : { kind: 'state', val: s }));
  }
  function toggleActivity(n) {
    setFilter((f) =>
      f.kind === 'activity' && f.val === n ? { kind: 'all', val: null } : { kind: 'activity', val: n }
    );
  }

  const nurOrder = { BNN: 0, UNN1: 1, UNN2: 2 };
  let rows = plots.filter((p) => {
    if (filter.kind === 'state') return effStatus(db, p).state === filter.val;
    if (filter.kind === 'activity') return plotInActivity(db, p, filter.val);
    return true;
  });
  rows = [...rows].sort((a, b) => {
    const na = nurOrder[nurseryOfPlot(a)],
      nb = nurOrder[nurseryOfPlot(b)];
    if (na !== nb) return na - nb;
    return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  });

  const statCard = (label, value, tone, active, onClick) => (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[120px] bg-white rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
        active ? 'border-emerald-500 shadow-[0_4px_16px_rgba(16,185,129,.15)]' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={`text-2xl font-black mt-1 tabular-nums ${tone}`}>{value}</div>
    </button>
  );

  return (
    <>
      {/* Header + nursery filter */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-slate-800 text-[15px]">{t('pm.tabDash')}</h2>
          <div className="text-[11px] font-semibold text-slate-400">
            {fNursery === 'all' ? t('pm.ledeAll') : t('pm.ledeNur', { n: NURSERIES[fNursery].label })}
          </div>
        </div>
        <select
          value={fNursery}
          onChange={(e) => {
            setFNursery(e.target.value);
            setFilter({ kind: 'all', val: null });
          }}
          className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
        >
          <option value="all">{t('pm.allNurseries')}</option>
          {Object.keys(NURSERIES).map((k) => (
            <option key={k} value={k}>
              {NURSERIES[k].label}
            </option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      <div className="flex gap-2.5 flex-wrap">
        {statCard(t('pm.totalPlots'), counts.total, 'text-slate-800', filter.kind === 'all', () =>
          setFilter({ kind: 'all', val: null })
        )}
        {statCard(stateLabel('overdue'), counts.overdue, 'text-rose-600', filter.kind === 'state' && filter.val === 'overdue', () =>
          toggleState('overdue')
        )}
        {statCard(stateLabel('soon'), counts.soon, 'text-amber-600', filter.kind === 'state' && filter.val === 'soon', () =>
          toggleState('soon')
        )}
        {statCard(stateLabel('ontrack'), counts.ontrack, 'text-emerald-600', filter.kind === 'state' && filter.val === 'ontrack', () =>
          toggleState('ontrack')
        )}
      </div>

      {/* Stage pipeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('pm.pipeTitle')}</h3>
          <span className="text-[11px] font-bold text-slate-400">{t('pm.inProcess', { n: inProc })}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-[720px]">
            {ACTIVITIES.map((a) => {
              const n = stageCounts[a.n];
              const active = filter.kind === 'activity' && filter.val === a.n;
              return (
                <button
                  key={a.n}
                  onClick={() => toggleActivity(a.n)}
                  className={`flex-1 px-1.5 py-3 text-center border-r border-slate-100 last:border-0 transition-colors cursor-pointer ${
                    active ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-tight min-h-[24px]">
                    {a.short}
                  </div>
                  <div className={`text-lg font-black tabular-nums ${n === 0 ? 'text-slate-300' : 'text-slate-800'}`}>
                    {n}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active filter chip */}
      {filter.kind !== 'all' && (
        <div className="text-[12px] font-bold text-slate-500 flex items-center gap-2">
          {t('pm.filter')}
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1">
            {filter.kind === 'state'
              ? stateLabel(filter.val)
              : t('pm.filterActivity', { a: activityByN(filter.val).name })}
            <button onClick={() => setFilter({ kind: 'all', val: null })} className="font-black cursor-pointer">
              ✕
            </button>
          </span>
        </div>
      )}

      {/* Status table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('pm.statusTitle')}</h3>
          <span className="text-[11px] font-bold text-slate-400">{t('pm.shown', { n: rows.length })}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="px-3 py-2.5">Plot</th>
                <th className="px-3 py-2.5">{t('pm.colActivity')}</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">{t('pm.colDays')}</th>
                <th className="px-3 py-2.5">{t('pm.colEst')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400 font-bold text-sm">
                    {t('pm.noMatch')}
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const st = effStatus(db, p);
                  const ee = effEstEnd(db, p);
                  let days = <span className="text-slate-300">—</span>;
                  if (st.state === 'overdue')
                    days = <span className="text-rose-600 font-black tabular-nums">{Math.abs(st.left)}</span>;
                  else if (st.state !== 'none')
                    days = (
                      <span className={`font-black tabular-nums ${st.left > 7 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {st.left}
                      </span>
                    );
                  return (
                    <tr key={p} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => openDetail(p)}
                          className="font-black text-emerald-700 hover:underline cursor-pointer"
                        >
                          {p}
                        </button>
                        {isMulti(p) && (
                          <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
                            {t('pm.multiTag', { n: areasOf(p).length })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600">{effActivityName(db, p)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-black border ${STATE_BADGE[st.state]}`}
                        >
                          {stateLabel(st.state)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{days}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600">{ee ? prettyD(ee) : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* What was keyed in on a given day */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('pm.byDateTitle')}</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={onDate}
              max={todayStr()}
              onChange={(e) => setOnDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
            />
            {onDate && (
              <button
                onClick={() => setOnDate('')}
                className="text-[11px] font-black text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          {!onDate ? (
            <div className="text-[12px] font-semibold text-slate-400">{t('pm.byDateHint')}</div>
          ) : (
            (() => {
              // Only the plots the nursery filter is already showing.
              const visible = new Set(plots);
              const rows = historyOn(db, onDate).filter((h) => visible.has(h.key.split('#')[0]));
              if (!rows.length) {
                return <div className="text-[12px] font-semibold text-slate-400">{t('pm.byDateEmpty')}</div>;
              }
              return (
                <>
                  <div className="text-[11px] font-bold text-slate-400 mb-2">
                    {t('pm.byDateCount', { n: rows.length, date: prettyD(onDate) })}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[380px]">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="px-3 py-2">Plot</th>
                          <th className="px-3 py-2">{t('pm.colActivity')}</th>
                          <th className="px-3 py-2">{t('pm.colBy')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((h, i) => (
                          <tr key={`${h.key}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-black text-slate-800">{keyLabel(h.key)}</td>
                            <td className="px-3 py-2 font-semibold text-slate-600">
                              {activityByN(h.actN) ? activityByN(h.actN).name : '—'}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-500">{h.by || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()
          )}
        </div>
      </div>

      {/* Demo tools */}
      <div className="text-[11px] font-bold text-slate-400 text-center">
        {t('pm.demoTools')}{' '}
        <button
          onClick={() => {
            replaceDB(seedSample());
            flash(t('pm.sampleLoaded'));
          }}
          className="text-emerald-600 hover:underline cursor-pointer"
        >
          {t('pm.fillSample')}
        </button>{' '}
        ·{' '}
        <button
          onClick={() => {
            replaceDB(freshDB());
            flash(t('pm.cleared'));
          }}
          className="text-rose-500 hover:underline cursor-pointer"
        >
          {t('pm.clearAll')}
        </button>
      </div>
    </>
  );
}

/* ================= PLOT DETAIL (log) MODAL ================= */
function LogTable({ db, k, t }) {
  const logs = (db.logs[k] || []).slice().reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[560px]">
        <thead>
          <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest">
            <th className="px-2 py-2">No.</th>
            <th className="px-2 py-2">{t('pm.colActivity')}</th>
            <th className="px-2 py-2">{t('pm.logStart')}</th>
            <th className="px-2 py-2">{t('pm.logEnd')}</th>
            <th className="px-2 py-2">{t('pm.logExp')}</th>
            <th className="px-2 py-2">{t('pm.logSpent')}</th>
            <th className="px-2 py-2">{t('pm.logIdeal')}</th>
            <th className="px-2 py-2">{t('pm.logVar')}</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-slate-400 font-bold">
                {t('pm.noLogs')}
              </td>
            </tr>
          ) : (
            logs.map((e) => {
              const act = activityByN(e.actN);
              const exp = addDays(e.start, e.ideal);
              const ongoing = e.end === null;
              const spent = ongoing ? null : diffDays(e.start, e.end);
              const varc = ongoing ? null : e.ideal - spent;
              return (
                <tr key={e.no} className={`border-t border-slate-100 ${ongoing ? 'bg-emerald-50/50' : ''}`}>
                  <td className="px-2 py-2 font-black tabular-nums text-slate-500">{e.no}</td>
                  <td className="px-2 py-2 font-bold text-slate-700">{act.name}</td>
                  <td className="px-2 py-2 text-slate-600">{prettyD(e.start)}</td>
                  <td className="px-2 py-2 text-slate-600">{ongoing ? '—' : prettyD(e.end)}</td>
                  <td className="px-2 py-2 text-slate-600">{prettyD(exp)}</td>
                  <td className="px-2 py-2 tabular-nums text-slate-600">{ongoing ? '—' : spent}</td>
                  <td className="px-2 py-2 tabular-nums text-slate-600">{e.ideal}</td>
                  <td className="px-2 py-2 tabular-nums font-black">
                    {ongoing ? (
                      '—'
                    ) : varc < 0 ? (
                      <span className="text-rose-600">({Math.abs(varc)})</span>
                    ) : (
                      <span className="text-emerald-600">{varc}</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ db, pid, t, onClose, openMap }) {
  const nk = nurseryOfPlot(pid);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
              {NURSERIES[nk].label}
            </div>
            <div className="font-black text-slate-800 text-lg leading-tight">{pid}</div>
          </div>
          <div className="flex items-center gap-2">
            {isMulti(pid) && (
              <button
                onClick={() => openMap(pid)}
                className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-lg px-3 py-2 cursor-pointer"
              >
                {t('pm.areaMap')}
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl cursor-pointer">
              ×
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          {isMulti(pid) ? (
            <>
              <div className="text-[12px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {t('pm.combined')} <b>{combinedLabel(db, pid)}</b>
              </div>
              {MULTI[pid].areas.map((a) => (
                <div key={a}>
                  <div className="text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1.5">
                    {t('pm.area', { a })}{' '}
                    <span className="text-slate-400 normal-case">({MULTI[pid].weights[a]}%)</span>
                  </div>
                  <LogTable db={db} k={`${pid}#${a}`} t={t} />
                </div>
              ))}
            </>
          ) : (
            <LogTable db={db} k={pid} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= AREA MAP MODAL ================= */
// Area-map photos are static files under public/maps so they are cached by
// the browser and never inflate the JS bundle.
const AREA_IMGS = { U8: './maps/u8.jpeg', B1: './maps/b1.jpeg', B4: './maps/b4.jpeg' };

function AreaMapModal({ pid, t, onClose }) {
  const cfg = MULTI[pid];
  if (!cfg) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
              {NURSERIES[nurseryOfPlot(pid)].label}
            </div>
            <div className="font-black text-slate-800 text-lg leading-tight">{t('pm.mapTitle', { pid })}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl cursor-pointer">
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-[12px] font-bold text-slate-500 mb-3">{cfg.cap}</p>
          <img src={AREA_IMGS[pid]} alt={`Peta kawasan ${pid}`} className="w-full rounded-xl border border-slate-200" />
        </div>
      </div>
    </div>
  );
}
