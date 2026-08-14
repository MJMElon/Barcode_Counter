import { useState } from 'react';
import {
  ACTIVITIES,
  MULTI,
  NURSERIES,
  aKey,
  activityByN,
  currentEntry,
  diffDays,
  durFor,
  computeStatus,
  effStatus,
  isLocked,
  isMulti,
  keyLabel,
  plotsOf,
  prettyD,
  saveDB,
  startEntry,
  tickedToday,
  todayStr,
} from './data.js';

// Update Status — the plots of a nursery are laid out as stations along a
// railway line. Each station shows only the plot number; tapping one opens a
// sheet where the Field Conductor picks the current activity. Built for
// phones: one tap to open, one tap to pick, one tap to save — no wide grid
// to scroll sideways through.

const DOT = {
  ontrack: 'bg-emerald-500',
  soon: 'bg-amber-500',
  overdue: 'bg-rose-500',
  none: 'bg-slate-300',
};
const CHIP = {
  ontrack: 'border-emerald-200 hover:border-emerald-400',
  soon: 'border-amber-200 hover:border-amber-400',
  overdue: 'border-rose-200 hover:border-rose-400',
  none: 'border-slate-200 hover:border-slate-300',
};

// Every storage key belonging to a plot (one per area for multi-area plots).
export function keysOfPlot(pid) {
  return isMulti(pid) ? MULTI[pid].areas.map((a) => aKey(pid, a)) : [pid];
}

export default function EntryTab({ db, t, staffName, refresh, flash, openMap }) {
  const [nursery, setNursery] = useState('BNN');
  const [open, setOpen] = useState(null); // plot id shown in the sheet

  const plots = plotsOf(nursery);
  const allKeys = plots.flatMap(keysOfPlot);
  const doneToday = allKeys.filter((k) => tickedToday(db, k)).length;

  const pending = allKeys.filter((k) => db.editReq[k]);

  function approveEdit(key) {
    db.unlocked[key] = true;
    delete db.editReq[key];
    saveDB(db);
    refresh();
    flash(t('pm.unlockedToast', { k: keyLabel(key) }));
  }
  function rejectEdit(key) {
    delete db.editReq[key];
    saveDB(db);
    refresh();
    flash(t('pm.rejectedToast', { k: keyLabel(key) }));
  }

  return (
    <>
      {/* Header: nursery picker + how many plots are done today */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-slate-800 text-[15px]">{t('pm.tabEntry')}</h2>
          <div className="text-[11px] font-bold text-slate-400">
            {t('pm.progress', { done: doneToday, total: allKeys.length })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          {t('pm.nursery')}
          <select
            value={nursery}
            onChange={(e) => setNursery(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
          >
            {Object.keys(NURSERIES).map((k) => (
              <option key={k} value={k}>
                {NURSERIES[k].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Edit requests needing supervisor approval */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
          <h4 className="text-[11px] font-black text-amber-800 uppercase tracking-wide mb-2">
            {t('pm.reqPanelTitle')}
          </h4>
          {pending.map((k) => (
            <div key={k} className="flex items-center gap-2 flex-wrap py-1.5 border-t border-amber-100 first:border-0">
              <span className="font-black text-slate-800 text-[13px]">{keyLabel(k)}</span>
              <span className="text-[11px] font-bold text-amber-700">
                {t('pm.requestedBy', { by: db.editReq[k].by, date: prettyD(db.editReq[k].at) })}
              </span>
              <span className="flex-1" />
              <button
                onClick={() => approveEdit(k)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg px-3 py-1.5 cursor-pointer"
              >
                {t('pm.approve')}
              </button>
              <button
                onClick={() => rejectEdit(k)}
                className="bg-white border border-slate-300 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-lg px-3 py-1.5 cursor-pointer"
              >
                {t('pm.reject')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Legend + hint */}
      <div className="flex items-center justify-center gap-3 flex-wrap text-[10px] font-bold text-slate-400">
        {['ontrack', 'soon', 'overdue', 'none'].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT[s]}`} />
            {t(`pm.state.${s}`)}
          </span>
        ))}
      </div>
      <div className="text-center text-[11px] font-semibold text-slate-400 -mt-1">{t('pm.railHint')}</div>

      {/* The railway: one station per plot */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-3 py-4 sm:px-5">
        <div className="relative max-w-[520px] mx-auto">
          {/* the rail itself */}
          <div className="absolute left-[18px] top-5 bottom-5 w-[3px] bg-slate-200 rounded-full" />
          {plots.map((pid) => {
            const st = effStatus(db, pid);
            const keys = keysOfPlot(pid);
            const done = keys.every((k) => tickedToday(db, k));
            const locked = keys.every((k) => isLocked(db, k));
            return (
              <button
                key={pid}
                onClick={() => setOpen(pid)}
                className="relative w-full flex items-center gap-3 py-1.5 cursor-pointer group"
              >
                {/* station node */}
                <span
                  className={`relative z-10 shrink-0 w-[22px] h-[22px] ml-[8px] rounded-full ring-4 ring-white ${DOT[st.state]} transition-transform group-hover:scale-110`}
                />
                {/* plot chip — plot number only */}
                <span
                  className={`flex-1 flex items-center justify-between gap-2 bg-white border-2 rounded-xl px-4 py-3 transition-colors ${CHIP[st.state]}`}
                >
                  <span className="font-black text-slate-800 text-[17px] tracking-wide">{pid}</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-black">
                    {isMulti(pid) && (
                      <span className="text-sky-600">{t('pm.multiTag', { n: MULTI[pid].areas.length })}</span>
                    )}
                    {locked && <span title={t('pm.lockedTip')}>🔒</span>}
                    {done && !locked && <span className="text-emerald-600">✓</span>}
                    <span className="text-slate-300 text-lg">›</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <PlotSheet
          db={db}
          pid={open}
          t={t}
          staffName={staffName}
          refresh={refresh}
          flash={flash}
          openMap={openMap}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/* ================= PLOT SHEET ================= */
// One plot at a time. Multi-area plots get an area selector; picking an area
// swaps in a fresh editor (keyed) so the selection never leaks between areas.
function PlotSheet({ db, pid, t, staffName, refresh, flash, openMap, onClose }) {
  const areas = isMulti(pid) ? MULTI[pid].areas : [null];
  const [area, setArea] = useState(areas[0]);
  const key = area ? aKey(pid, area) : pid;

  // After saving an area, move on to the next one still not done today;
  // when the whole plot is done, close the sheet.
  function afterSave() {
    const next = areas.find((a) => a && a !== area && !tickedToday(db, aKey(pid, a)));
    if (next) setArea(next);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
              {NURSERIES[nurseryKeyOf(pid)].label}
            </div>
            <div className="font-black text-slate-800 text-2xl leading-tight">{pid}</div>
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
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Area selector for multi-area plots */}
        {isMulti(pid) && (
          <div className="flex gap-1.5 px-5 pt-3 flex-wrap">
            {areas.map((a) => {
              const done = tickedToday(db, aKey(pid, a));
              return (
                <button
                  key={a}
                  onClick={() => setArea(a)}
                  className={`rounded-xl px-3.5 py-2 text-[12px] font-black transition-colors cursor-pointer border ${
                    area === a
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400'
                  }`}
                >
                  {t('pm.area', { a })} {done && '✓'}
                </button>
              );
            })}
          </div>
        )}

        <AreaEditor
          key={key}
          db={db}
          storeKey={key}
          t={t}
          staffName={staffName}
          refresh={refresh}
          flash={flash}
          onSaved={afterSave}
        />
      </div>
    </div>
  );
}

function nurseryKeyOf(pid) {
  for (const k in NURSERIES) if (pid.startsWith(NURSERIES[k].prefix)) return k;
  return 'BNN';
}

/* ================= ACTIVITY PICKER FOR ONE UNIT ================= */
function AreaEditor({ db, storeKey, t, staffName, refresh, flash, onSaved }) {
  const cur = currentEntry(db, storeKey);
  const locked = isLocked(db, storeKey);
  const pend = db.editReq[storeKey];
  const [sel, setSel] = useState(cur ? cur.actN : null);

  const st = computeStatus(db, storeKey);
  const dayN = cur ? diffDays(cur.start, todayStr()) + 1 : null;

  function requestEdit() {
    db.editReq[storeKey] = { by: 'FC', at: todayStr(), status: 'pending' };
    saveDB(db);
    refresh();
    flash(t('pm.reqSent'));
  }

  function save() {
    if (sel == null) return;
    const today = todayStr();
    const c = currentEntry(db, storeKey);
    if (!c) {
      startEntry(db, storeKey, sel, today);
    } else if (sel > c.actN) {
      c.end = today;
      startEntry(db, storeKey, sel, today);
    } else if (sel < c.actN) {
      c.actN = sel;
      c.ideal = durFor(storeKey, activityByN(sel));
    }
    db.updated[storeKey] = { by: staffName || 'FC', at: today };
    delete db.unlocked[storeKey];
    saveDB(db);
    refresh();
    flash(t('pm.savedPlot', { k: keyLabel(storeKey) }));
    onSaved();
  }

  return (
    <>
      <div className="px-5 py-3 overflow-y-auto flex-1">
        {/* What the plot is on right now */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 mb-3">
          {cur ? (
            <>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('pm.currentLabel')}
              </div>
              <div className="font-black text-slate-800 text-[15px]">{activityByN(cur.actN).name}</div>
              <div className="text-[11px] font-bold text-slate-500">
                {t('pm.dayN', { n: dayN })}
                {st.state === 'overdue' && (
                  <span className="text-rose-600"> · {t('pm.lateBy', { n: Math.abs(st.left) })}</span>
                )}
              </div>
            </>
          ) : (
            <div className="text-[12px] font-bold text-slate-400 italic">{t('pm.state.none')}</div>
          )}
        </div>

        {locked ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-center">
            <div className="text-[12px] font-bold text-amber-800 mb-2">{t('pm.lockedToday')}</div>
            {pend ? (
              <div className="text-[11px] font-black text-amber-700 uppercase tracking-wide">
                {t('pm.pendingEdit')}
              </div>
            ) : (
              <button
                onClick={requestEdit}
                className="bg-white border border-amber-300 text-amber-800 font-black text-[11px] uppercase tracking-widest rounded-xl px-4 py-2.5 cursor-pointer"
              >
                {t('pm.requestEdit')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              {t('pm.pickActivity')}
            </div>
            <div className="space-y-1.5">
              {ACTIVITIES.map((a) => {
                const on = sel === a.n;
                return (
                  <button
                    key={a.n}
                    onClick={() => setSel(a.n)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 border-2 text-left transition-colors cursor-pointer ${
                      on
                        ? 'bg-emerald-50 border-emerald-500'
                        : 'bg-white border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-black ${
                        on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {a.n}
                    </span>
                    <span className={`flex-1 text-[13px] font-black ${on ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {a.name}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400">
                      {t('pm.idealDays', { d: a.days })}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!locked && (
        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={save}
            disabled={sel == null}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 transition-colors cursor-pointer"
          >
            {t('pm.save')}
          </button>
        </div>
      )}
    </>
  );
}
