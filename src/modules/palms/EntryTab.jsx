import { useState } from 'react';
import {
  ACTIVITIES,
  MULTI,
  NURSERIES,
  aKey,
  areaMapUrl,
  activityByN,
  computeStatus,
  currentEntry,
  diffDays,
  durFor,
  effStatus,
  isMulti,
  keyLabel,
  plotsOf,
  recordHistory,
  saveDB,
  startEntry,
  tickedToday,
  todayStr,
} from './data.js';

// Update Status — the plots of a nursery are drawn as a train, one carriage
// per plot. Tapping a carriage opens a sheet where the Field Conductor picks
// the current activity. Built for phones: everything in the sheet fits one
// screen, so picking an activity never needs a scroll.
//
// The Field Conductor may change a status whenever they like. Changing one
// that was already keyed in today only asks them to confirm — there is no
// supervisor approval step.

const DOT = {
  ontrack: 'bg-emerald-500',
  soon: 'bg-amber-500',
  overdue: 'bg-rose-500',
  none: 'bg-slate-300',
};
const CAR = {
  ontrack: { body: 'bg-emerald-400', roof: 'bg-emerald-600' },
  soon: { body: 'bg-amber-400', roof: 'bg-amber-600' },
  overdue: { body: 'bg-rose-400', roof: 'bg-rose-600' },
  none: { body: 'bg-slate-300', roof: 'bg-slate-400' },
};

// Sleepers + rail, drawn per cell so the track runs unbroken across a row and
// starts again cleanly on the next one.
function Track() {
  return (
    <div className="relative h-2.5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-slate-400/70" />
      <div
        className="absolute inset-x-0 top-[3px] h-1.5"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgb(148 163 184 / .55) 0 4px, transparent 4px 13px)',
        }}
      />
    </div>
  );
}

// Cartoon locomotive at the head of the train. Decorative; only the smoke
// moves.
function Locomotive() {
  return (
    <div className="select-none">
      <div className="h-[78px] flex items-end">
        <svg viewBox="0 0 104 78" className="w-full h-full" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          {/* smoke — three puffs leaving the funnel on a stagger */}
          {[0, 0.8, 1.6].map((d, i) => (
            <circle
              key={i}
              cx="24"
              cy="30"
              r={4 + i * 0.6}
              fill="#cbd5e1"
              className="animate-puff"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
          {/* chimney */}
          <rect x="18" y="30" width="12" height="14" rx="2.5" fill="#64748b" />
          {/* boiler */}
          <rect x="8" y="42" width="52" height="22" rx="10" fill="#ef4444" />
          {/* cab + roof */}
          <rect x="50" y="24" width="38" height="40" rx="6" fill="#ef4444" />
          <rect x="46" y="17" width="48" height="9" rx="3.5" fill="#f59e0b" />
          <rect x="58" y="31" width="24" height="17" rx="3.5" fill="#bae6fd" />
          {/* footplate */}
          <rect x="4" y="60" width="90" height="8" rx="3" fill="#f59e0b" />
          {/* wheels */}
          <circle cx="22" cy="70" r="7" fill="#64748b" />
          <circle cx="22" cy="70" r="2.5" fill="#e2e8f0" />
          <circle cx="46" cy="70" r="7" fill="#64748b" />
          <circle cx="46" cy="70" r="2.5" fill="#e2e8f0" />
          <circle cx="74" cy="69" r="8.5" fill="#64748b" />
          <circle cx="74" cy="69" r="3" fill="#e2e8f0" />
          {/* coupling to the first carriage */}
          <rect x="92" y="64" width="12" height="4" rx="2" fill="#94a3b8" />
        </svg>
      </div>
      <Track />
    </div>
  );
}

// Every storage key belonging to a plot (one per area for multi-area plots).
export function keysOfPlot(pid) {
  return isMulti(pid) ? MULTI[pid].areas.map((a) => aKey(pid, a)) : [pid];
}

export default function EntryTab({ db, t, staffName, refresh, flash }) {
  const [nursery, setNursery] = useState('BNN');
  const [open, setOpen] = useState(null); // plot id shown in the sheet

  const plots = plotsOf(nursery);
  const allKeys = plots.flatMap(keysOfPlot);
  const doneToday = allKeys.filter((k) => tickedToday(db, k)).length;

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

      {/* Legend + hint */}
      <div className="flex items-center justify-center gap-3 flex-wrap text-[10px] font-bold text-slate-400">
        {['ontrack', 'soon', 'overdue'].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT[s]}`} />
            {t(`pm.state.${s}`)}
          </span>
        ))}
      </div>
      <div className="text-center text-[11px] font-semibold text-slate-400 -mt-1">{t('pm.railHint')}</div>

      {/* The train: a locomotive pulling one carriage per plot. Carriages wrap
          onto the next length of track, so the page still scrolls downwards. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-2 py-4 sm:px-4 overflow-hidden">
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-y-3">
          <Locomotive />
          {plots.map((pid) => {
            const st = effStatus(db, pid);
            const keys = keysOfPlot(pid);
            const done = keys.every((k) => tickedToday(db, k));
            const c = CAR[st.state];
            return (
              <button
                key={pid}
                onClick={() => setOpen(pid)}
                title={pid}
                className="cursor-pointer group"
              >
                <div className="h-[78px] flex flex-col items-center justify-end">
                  <div className="relative w-[92%] max-w-[86px]">
                    {/* roof */}
                    <div className={`w-full h-[10px] rounded-t-lg ${c.roof}`} />
                    {/* body + window carrying the plot number */}
                    <div
                      className={`w-[92%] mx-auto h-[42px] rounded-md ${c.body} flex items-center justify-center transition-transform group-hover:-translate-y-0.5`}
                    >
                      <span className="w-[78%] h-[27px] rounded bg-sky-50 border border-white/70 grid place-items-center">
                        <span className="font-black text-slate-800 text-[14px] leading-none tracking-wide">
                          {pid}
                        </span>
                      </span>
                    </div>
                    {/* wheels */}
                    <div className="w-[92%] mx-auto flex justify-around -mt-[3px]">
                      {[0, 1].map((i) => (
                        <span key={i} className="w-4 h-4 rounded-full bg-slate-500 grid place-items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        </span>
                      ))}
                    </div>
                    {/* done / multi-area badge */}
                    {(done || isMulti(pid)) && (
                      <span className="absolute -top-2 -right-1 text-[10px] leading-none bg-white rounded-full px-1.5 py-1 shadow-sm border border-slate-200">
                        {done ? '✅' : `${MULTI[pid].areas.length}⬦`}
                      </span>
                    )}
                  </div>
                </div>
                <Track />
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
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/* ================= PLOT SHEET ================= */
// One plot at a time. Multi-area plots get an area selector; picking an area
// swaps in a fresh editor (keyed) so the selection never leaks between areas.
function PlotSheet({ db, pid, t, staffName, refresh, flash, onClose }) {
  const multi = isMulti(pid);
  const areas = multi ? MULTI[pid].areas : [null];

  // A plot split into areas opens on its map, so the Field Conductor picks
  // the area off the picture rather than from a list of letters. The area
  // still waiting is the one preselected.
  const firstTodo = areas.find((a) => a && !tickedToday(db, aKey(pid, a))) || areas[0];
  const [area, setArea] = useState(firstTodo);
  const [step, setStep] = useState(multi ? 'map' : 'pick');
  const key = area ? aKey(pid, area) : pid;

  // After saving an area, show the map again with the area that is still
  // outstanding preselected. Once every area is done, close the sheet.
  function afterSave() {
    const next = areas.find((a) => a && a !== area && !tickedToday(db, aKey(pid, a)));
    if (next) {
      setArea(next);
      setStep('map');
    } else {
      onClose();
    }
  }

  if (multi && step === 'map') {
    return (
      <AreaMapStep
        db={db}
        pid={pid}
        areas={areas}
        target={area}
        t={t}
        onPick={(a) => {
          setArea(a);
          setStep('pick');
        }}
        onClose={onClose}
      />
    );
  }

  const cur = currentEntry(db, key);
  const st = computeStatus(db, key);
  const dayN = cur ? diffDays(cur.start, todayStr()) + 1 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col">
        {/* Compact header: plot and what it is on sit on one line so the
            activity picker starts as high up the screen as possible. */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="shrink-0">
            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none">
              {NURSERIES[nurseryKeyOf(pid)].label}
            </div>
            <div className="font-black text-slate-800 text-xl leading-tight">{pid}</div>
          </div>
          <div className="flex-1 min-w-0 border-l border-slate-200 pl-3">
            {cur ? (
              <>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  {t('pm.currentLabel')}
                </div>
                <div className="font-black text-slate-800 text-[13px] leading-tight truncate">
                  {activityByN(cur.actN).name}
                </div>
                <div className="text-[10px] font-bold text-slate-500 leading-tight">
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
          {multi && (
            <button
              onClick={() => setStep('map')}
              title={t('pm.areaMap')}
              aria-label={t('pm.areaMap')}
              className="shrink-0 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-lg px-2 py-1.5 cursor-pointer"
            >
              {t('pm.area', { a: area })}
            </button>
          )}
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

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

// Step one for a multi-area plot: the map, with a button per area. Areas
// already keyed in today are ticked; the outstanding one is ringed so it
// reads as the default choice.
function AreaMapStep({ db, pid, areas, target, t, onPick, onClose }) {
  const cfg = MULTI[pid];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="shrink-0">
            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none">
              {NURSERIES[nurseryKeyOf(pid)].label}
            </div>
            <div className="font-black text-slate-800 text-xl leading-tight">{pid}</div>
          </div>
          <div className="flex-1 min-w-0 border-l border-slate-200 pl-3">
            <div className="text-[11px] font-bold text-slate-500 leading-tight">{t('pm.pickArea')}</div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1">
          <img
            src={areaMapUrl(pid)}
            alt={`Peta kawasan ${pid}`}
            className="w-full rounded-xl border border-slate-200"
          />
          <p className="text-[11px] font-semibold text-slate-500 mt-2">{cfg.cap}</p>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-3 gap-2">
          {areas.map((a) => {
            const done = tickedToday(db, aKey(pid, a));
            const isTarget = a === target;
            return (
              <button
                key={a}
                onClick={() => onPick(a)}
                className={`rounded-xl px-2 py-3 text-[12px] font-black transition-colors cursor-pointer border-2 ${
                  isTarget
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : done
                      ? 'bg-slate-50 border-slate-200 text-slate-400'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-400'
                }`}
              >
                {t('pm.area', { a })}
                {done && <span className="block text-[10px] font-bold mt-0.5">✓</span>}
              </button>
            );
          })}
        </div>
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
  const [sel, setSel] = useState(cur ? cur.actN : null);
  const [confirming, setConfirming] = useState(false);

  const alreadyToday = tickedToday(db, storeKey);

  function commit() {
    const today = todayStr();
    const c = currentEntry(db, storeKey);
    if (!c) {
      startEntry(db, storeKey, sel, today, staffName || 'FC');
    } else if (sel > c.actN) {
      c.end = today;
      startEntry(db, storeKey, sel, today, staffName || 'FC');
    } else if (sel < c.actN) {
      c.actN = sel;
      c.ideal = durFor(storeKey, activityByN(sel));
    }
    db.updated[storeKey] = { by: staffName || 'FC', at: today };
    recordHistory(db, { key: storeKey, actN: sel, by: staffName || 'FC', at: today });
    saveDB(db);
    refresh();
    flash(t('pm.savedPlot', { k: keyLabel(storeKey) }));
    setConfirming(false);
    onSaved();
  }

  function save() {
    if (sel == null) return;
    // Changing something already keyed in today only needs a confirmation.
    if (alreadyToday) {
      setConfirming(true);
      return;
    }
    commit();
  }

  return (
    <>
      <div className="px-4 py-2.5 overflow-y-auto flex-1">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('pm.pickActivity')}
        </div>
        {/* Phones get two columns filled downwards — 1–6 left, 7–11 right —
            so every activity is reachable without a scroll. On a laptop
            there is room for the original single full-width list. */}
        <div className="grid grid-rows-6 grid-flow-col gap-1 sm:grid-rows-none sm:grid-flow-row sm:grid-cols-1 sm:gap-1.5">
          {ACTIVITIES.map((a) => {
            const on = sel === a.n;
            return (
              <button
                key={a.n}
                onClick={() => setSel(a.n)}
                className={`w-full flex items-center gap-1.5 sm:gap-2.5 rounded-lg px-2 sm:px-3 py-2 sm:py-2.5 border-2 text-left transition-colors cursor-pointer ${
                  on ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'
                }`}
              >
                <span
                  className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full grid place-items-center text-[10px] sm:text-[11px] font-black ${
                    on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {a.n}
                </span>
                <span
                  className={`flex-1 min-w-0 text-[12px] sm:text-[13px] leading-tight font-black ${
                    on ? 'text-emerald-800' : 'text-slate-700'
                  }`}
                >
                  {/* Short label on phones, full name once there is room */}
                  <span className="sm:hidden">{a.mShort}</span>
                  <span className="hidden sm:inline">{a.name}</span>
                </span>
                {/* The ideal-day count is hidden on phones: the width it takes
                    is what forces the longer names onto a second line. */}
                <span className="hidden sm:inline shrink-0 text-[10px] font-bold text-slate-400">
                  {t('pm.idealDays', { d: a.days })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-100">
        {confirming ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-[12px] font-bold text-amber-900 mb-2.5">{t('pm.confirmChange')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 bg-white border border-slate-300 text-slate-600 font-black text-[11px] uppercase tracking-widest rounded-xl py-2.5 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={commit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl py-2.5 cursor-pointer"
              >
                {t('pm.yesChange')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={save}
            disabled={sel == null}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3 transition-colors cursor-pointer"
          >
            {alreadyToday ? t('pm.changeStatus') : t('pm.save')}
          </button>
        )}
      </div>
    </>
  );
}
