import { useEffect, useMemo, useState } from 'react';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  BATCH_SETUP_NEEDED,
  SETUP_NEEDED,
  WORK_TYPES,
  allowedNurseries,
  canMaintain,
  deleteRecord,
  loadMaintenanceData,
  loadPlotBatches,
  loadSchedules,
  saveRecord,
  toCsv,
  todayStr,
  workTypeByKey,
  workTypeLabel,
} from './data.js';
import Timeline from './Timeline.jsx';
import WorkSheet from './WorkSheet.jsx';
import {
  WEEKS,
  isDone as isJobDone,
  mergeWeekTasks,
  monthLabelOf,
  weekDates,
  weekOfDate,
} from './schedule.js';

/* The office files its schedule under BNN / UNN1 / UNN2; shared_plots writes
   the same nurseries as "BNN" / "UNN 1" / "UNN 2". Compare on letters and
   digits alone so one is found from the other. */
const nurseryKey = (name) => String(name || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

// Maintenance work recorded in the field by a Field Conductor: which job, on
// which plot, on which day. Plots come from shared_plots (Seedling Stock
// Management settings); which nurseries a user sees is set on the main
// portal's User Access, the same setting Plot Status uses.
export default function MaintenanceModule() {
  const { staffName, permissions } = useAuth();
  const { t, lang } = useLang();

  const [plots, setPlots] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setup, setSetup] = useState(false);
  const [nursery, setNursery] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { record? } — open sheet
  const [toast, setToast] = useState(null);
  const [schedule, setSchedule] = useState([]);     // one row per nursery that has a plan
  const [batchMap, setBatchMap] = useState(new Map());
  const [sheet, setSheet] = useState(null);         // { week, workType }
  const [saving, setSaving] = useState(false);

  const allowed = allowedNurseries(permissions);
  const mayRecord = canMaintain(permissions, 'record');
  const mayEdit   = canMaintain(permissions, 'edit');
  const mayExport = canMaintain(permissions, 'export');

  const flash = (text) => {
    setToast(text);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 3000);
  };

  async function reload() {
    try {
      const d = await loadMaintenanceData();
      setPlots(d.plots);
      setRecords(d.records);
      setError(null);
      setSetup(false);
    } catch (e) {
      if (e && e.message === SETUP_NEEDED) setSetup(true);
      else setError(e.message || String(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);

  const visiblePlots = useMemo(
    () => plots.filter((p) => allowed === null || allowed.includes(p.nursery_name)),
    [plots, allowed]
  );

  const nurseryOptions = useMemo(
    () => [...new Set(visiblePlots.map((p) => p.nursery_name).filter(Boolean))].sort(),
    [visiblePlots]
  );

  // Records this user may see, then the on-screen filters.
  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    return records.filter(
      (r) =>
        (allowed === null || allowed.includes(r.nursery_name)) &&
        (!nursery || r.nursery_name === nursery) &&
        (!q ||
          (r.plot_name || '').toLowerCase().includes(q) ||
          (r.remark || '').toLowerCase().includes(q))
    );
  }, [records, allowed, nursery, query]);

  const today = todayStr();
  const month = monthLabelOf(today);
  const currentWeek = weekOfDate(today);

  // Which nurseries the timeline covers: the one the filter names, or every
  // one this person can see. "All nurseries" used to be a dead end asking
  // them to choose first — the week's work is the same question either way.
  const timelineNurseries = useMemo(
    () => (nursery ? [nursery] : nurseryOptions),
    [nursery, nurseryOptions]
  );
  const nurseriesSig = timelineNurseries.join('|');

  // The office's schedules for those nurseries this month, and what is
  // standing in each plot. Both are read once and re-read after a save.
  useEffect(() => {
    let live = true;
    const names = nurseriesSig ? nurseriesSig.split('|') : [];
    if (!names.length) { setSchedule([]); return undefined; }
    // The office files under BNN / UNN1; shared_plots says "UNN 1". Ask for
    // both spellings and keep whichever comes back.
    const keys = [...new Set(names.flatMap((n) => [n, nurseryKey(n)]))];
    loadSchedules(keys, month)
      .then((rows) => { if (live) setSchedule(rows); })
      .catch(() => { if (live) setSchedule([]); });
    return () => { live = false; };
  }, [nurseriesSig, month]);

  useEffect(() => {
    let live = true;
    loadPlotBatches()
      .then((m) => { if (live) setBatchMap(m); })
      .catch(() => { if (live) setBatchMap(new Map()); });
    return () => { live = false; };
  }, [records.length]);

  // Every week's jobs, and how many of each are already recorded.
  const tasksByWeek = useMemo(
    () => WEEKS.reduce((acc, w) => { acc[w] = mergeWeekTasks(schedule, w); return acc; }, {}),
    [schedule]
  );
  const counts = useMemo(() => WEEKS.reduce((acc, w) => {
    acc[w] = WORK_TYPES.reduce((c, wt) => { c[wt.key] = tasksByWeek[w][wt.key].length; return c; }, {});
    return acc;
  }, {}), [tasksByWeek]);
  const doneCounts = useMemo(() => WEEKS.reduce((acc, w) => {
    acc[w] = WORK_TYPES.reduce((c, wt) => {
      c[wt.key] = tasksByWeek[w][wt.key].filter((x) =>
        isJobDone(records, { workTypeKey: wt.key, plot: x.plot, week: w, month })).length;
      return c;
    }, {});
    return acc;
  }, {}), [tasksByWeek, records, month]);

  async function handleSheetSave({ task, batches, remark }) {
    const plot = visiblePlots.find((p) => p.plot_name === task.plot)
      || { plot_name: task.plot, nursery_name: task.nursery || nursery || null };
    setSaving(true);
    try {
      await saveRecord({
        plot,
        workTypeKey: sheet.workType.key,
        // Today, always: the record says the job was done, and it is being
        // written now.
        date: today,
        chemical: task.chemical,
        remark,
        batches,
        weekNo: sheet.week,
        scheduleMonth: month,
        reportedBy: staffName,
      });
      flash(t('mt.savedToast', { work: workTypeLabel(sheet.workType, lang), plot: task.plot }));
      reload();
    } catch (e) {
      // The job saved; only the batch/week columns were missing.
      if (e && e.message === BATCH_SETUP_NEEDED) { flash(t('mt.batchSetupNeeded')); reload(); }
      else flash(t('mt.saveErr', { msg: (e && e.message) || String(e) }));
    }
    setSaving(false);
  }

  async function handleSave(form) {
    const plot = visiblePlots.find((p) => p.plot_name === form.plotName);
    if (!plot) return;
    try {
      await saveRecord({
        id: editing && editing.record ? editing.record.id : null,
        plot,
        workTypeKey: form.workTypeKey,
        date: form.date,
        qty: form.qty,
        chemical: form.chemical,
        remark: form.remark,
        reportedBy: staffName,
      });
      flash(
        t('mt.savedToast', {
          work: workTypeLabel(workTypeByKey(form.workTypeKey), lang),
          plot: plot.plot_name,
        })
      );
      setEditing(null);
      reload();
    } catch (e) {
      flash(t('mt.saveErr', { msg: e.message || String(e) }));
    }
  }

  async function handleDelete(rec) {
    if (!mayEdit) return flash(t('mt.noPermEdit'));
    if (!window.confirm(t('mt.confirmDelete'))) return;
    try {
      await deleteRecord(rec.id);
      flash(t('mt.deletedToast'));
      reload();
    } catch (e) {
      flash(t('mt.saveErr', { msg: e.message || String(e) }));
    }
  }

  function handleExport() {
    if (!mayExport) return flash(t('mt.noPermExport'));
    const blob = new Blob([toCsv(visible, lang)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maintenance_${nursery || 'all'}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title={t('mt.title')} subtitle="FC Portal" user={staffName} back="/dashboard" />
      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Filters + actions */}
        <div className="flex flex-wrap gap-2">
          {nurseryOptions.length > 1 && (
            <select
              value={nursery}
              onChange={(e) => setNursery(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="">{t('mt.allNurseries')}</option>
              {nurseryOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('mt.searchPlot')}
            className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          {mayExport && !!visible.length && (
            <button
              onClick={handleExport}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-black text-[11px] uppercase tracking-widest rounded-xl px-4 py-2.5"
            >
              {t('mt.exportCsv')}
            </button>
          )}
        </div>

        {mayRecord && (
          <button
            onClick={() => setEditing({})}
            disabled={setup || !visiblePlots.length}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 transition-colors"
          >
            {t('mt.newRecord')}
          </button>
        )}

        {setup && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-bold">
            {t('mt.setupNeeded')}
          </div>
        )}

        {/* The month's schedule, as four blocks of seven days. Tap a job to
            record it against the plots the office asked for. */}
        {/* Always drawn once the table exists. It used to disappear entirely
            when a Field Conductor was not allowed to record, which looks
            exactly like the feature not being there. */}
        {!setup && (
          <>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('mt.schedule')}
              </span>
              <span className="text-[11px] font-black text-slate-500">{month}</span>
            </div>
            {!mayRecord ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-[13px] font-bold text-amber-800">
                {t('mt.noPermRecord')}
              </div>
            ) : !timelineNurseries.length ? (
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-5 text-center text-[13px] font-bold text-slate-400">
                {t('mt.noPlots')}
              </div>
            ) : !schedule.length ? (
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-5 text-center text-[13px] font-bold text-slate-400">
                {t('mt.noSchedule', { nursery: timelineNurseries.join(', '), month })}
              </div>
            ) : (
              <Timeline
                month={month}
                currentWeek={currentWeek}
                counts={counts}
                doneCounts={doneCounts}
                onOpen={(week, workType) => setSheet({ week, workType })}
              />
            )}
          </>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
            {t('mt.loadErr', { msg: error })}
          </div>
        )}

        {sheet && (
          <WorkSheet
            workType={sheet.workType}
            week={sheet.week}
            weekDates={weekDates(sheet.week, month)}
            month={month}
            tasks={tasksByWeek[sheet.week][sheet.workType.key]}
            batchMap={batchMap}
            today={today}
            saving={saving}
            isDone={(plot) => isJobDone(records, { workTypeKey: sheet.workType.key, plot, week: sheet.week, month })}
            onSave={handleSheetSave}
            onClose={() => setSheet(null)}
          />
        )}

        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-1">
          {t('mt.recent')}
        </div>

        {loading ? (
          <div className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-16 animate-pulse">
            {t('common.loading')}
          </div>
        ) : visible.length ? (
          <div className="space-y-2.5">
            {visible.map((r) => {
              const wt = workTypeByKey(r.work_type);
              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-slate-800 text-[15px] leading-tight truncate">
                        {wt ? wt.icon : '🛠️'} {workTypeLabel(wt, lang) || r.jenis || '—'}
                      </div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        📍 {r.plot_name} · {r.nursery_name || '—'}
                      </div>
                    </div>
                    {r.work_date === today && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-1">
                        ✓ {t('mt.today')}
                      </span>
                    )}
                  </div>

                  <div className="text-[12px] font-bold text-slate-500 mt-1.5">
                    🗓️ {r.work_date}
                    {r.qty != null ? ` · ${Number(r.qty).toLocaleString()}` : ''}
                    {r.chemical ? ` · ${r.chemical}` : ''}
                    {r.reported_by ? ` · ${t('mt.by', { name: r.reported_by })}` : ''}
                  </div>
                  {r.remark && (
                    <div className="text-[12px] text-slate-500 mt-1 italic break-words">{r.remark}</div>
                  )}

                  {mayEdit && (
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => setEditing({ record: r })}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl py-2"
                      >
                        {t('mt.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        className="px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[11px] uppercase tracking-widest rounded-xl py-2"
                      >
                        {t('mt.delete')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-400 text-sm font-bold py-16">
            {allowed !== null && allowed.length === 0 ? t('mt.noNurseryAccess') : t('mt.noRecords')}
          </div>
        )}
      </div>

      {editing && (
        <EntrySheet
          record={editing.record}
          plots={visiblePlots}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          t={t}
          lang={lang}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// Bottom sheet to record a job, or correct one already recorded.
function EntrySheet({ record, plots, onClose, onSave, t, lang }) {
  const [workTypeKey, setWorkTypeKey] = useState(record ? record.work_type : WORK_TYPES[0].key);
  const [plotName, setPlotName] = useState(record ? record.plot_name : '');
  const [date, setDate] = useState(record ? record.work_date : todayStr());
  const [qty, setQty] = useState(record && record.qty != null ? String(record.qty) : '');
  const [chemical, setChemical] = useState((record && record.chemical) || '');
  const [remark, setRemark] = useState((record && record.remark) || '');
  const [saving, setSaving] = useState(false);

  // Spraying and manuring use a product; weeding by hand does not.
  const showChemical = workTypeKey === 'pd' || workTypeKey === 'manuring' || workTypeKey === 'interrow';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-800 text-[15px] uppercase tracking-wide">
            🛠️ {record ? t('mt.editTitle') : t('mt.newTitle')}
          </h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl">
            ×
          </button>
        </div>

        {/* Big tap targets: this is filled in on a phone, in a nursery. */}
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
          {t('mt.work')}
        </label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {WORK_TYPES.map((w) => (
            <button
              key={w.key}
              onClick={() => setWorkTypeKey(w.key)}
              className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
                workTypeKey === w.key
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-lg leading-none">{w.icon}</div>
              <div className="text-[11px] font-black text-slate-700 leading-tight mt-1">
                {workTypeLabel(w, lang)}
              </div>
            </button>
          ))}
        </div>

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.plot')}
        </label>
        <select
          value={plotName}
          onChange={(e) => setPlotName(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 mb-3"
        >
          <option value="">{t('mt.pickPlot')}</option>
          {plots.map((p) => (
            <option key={p.plot_name} value={p.plot_name}>
              {p.plot_name}
              {p.nursery_name ? ` — ${p.nursery_name}` : ''}
            </option>
          ))}
        </select>

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.date')}
        </label>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 mb-3"
        />

        {showChemical && (
          <>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {t('mt.chemical')} <span className="text-slate-400 normal-case">· {t('mt.chemicalHint')}</span>
            </label>
            <input
              value={chemical}
              onChange={(e) => setChemical(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500 mb-3"
            />
          </>
        )}

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.qty')} <span className="text-slate-400 normal-case">· {t('mt.qtyHint')}</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 mb-3"
        />

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.remark')}
        </label>
        <textarea
          rows={2}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500 mb-4"
        />

        <button
          onClick={async () => {
            setSaving(true);
            await onSave({ workTypeKey, plotName, date, qty, chemical: chemical.trim(), remark: remark.trim() });
            setSaving(false);
          }}
          disabled={saving || !plotName || !date || !workTypeKey}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 transition-colors"
        >
          {saving ? t('auth.processing') : t('mt.save')}
        </button>
      </div>
    </div>
  );
}
