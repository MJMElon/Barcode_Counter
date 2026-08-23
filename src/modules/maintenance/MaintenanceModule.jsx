import { useEffect, useMemo, useState } from 'react';
import { useAutoSync, useOnline } from '../../hooks/useOnline.js';
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
  flushMaintenance,
  isModuleAdmin,
  loadMaintenanceData,
  loadPlotBatches,
  loadSchedules,
  pendingRecords,
  submitRecord,
  toCsv,
  todayStr,
  workTypeByKey,
  workTypeLabel,
} from './data.js';
import PhotoSlots from './PhotoSlots.jsx';
import ThisWeek from './ThisWeek.jsx';
import Timeline from './Timeline.jsx';
import WorkIcon from './WorkIcons.jsx';
import WorkSheet from './WorkSheet.jsx';
import { batchesIn } from './plotBatches.js';
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

/** Matches the work sheet: three photos is enough to show a job was done. */
const MAX_PHOTOS = 3;

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
  const [pending, setPending] = useState([]);   // records the queue is holding
  const [syncing, setSyncing] = useState(false);
  const online = useOnline();

  const allowed = allowedNurseries(permissions);
  const mayRecord = canMaintain(permissions, 'record');
  // Changing or removing a record already made is an admin's job. A Field
  // Conductor records the work; correcting the books is not the same act, and
  // the office is who answers for it. The maintenance 'edit' tick still has to
  // be on, so an admin can also be kept out of a module they do not run.
  const isAdmin   = isModuleAdmin(permissions, 'operation');
  const mayEdit   = isAdmin && canMaintain(permissions, 'edit');
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

  const refreshPending = () => pendingRecords().then(setPending).catch(() => setPending([]));

  /* Send anything waiting. useAutoSync already fires on mount, every minute
     while online, and the moment the connection comes back — which is exactly
     when a queue wants emptying. */
  async function sync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const before = (await pendingRecords()).length;
      if (before) {
        const r = await flushMaintenance();
        if (r.sent) { flash(t('mt.synced', { n: r.sent })); reload(); }
        if (r.dropped) flash(t('mt.syncDropped', { n: r.dropped }));
      }
    } catch (e) {
      console.warn('[maintenance] sync failed:', e);
    }
    await refreshPending();
    setSyncing(false);
  }
  useAutoSync(sync, 60000);

  const visiblePlots = useMemo(
    () => plots.filter((p) => allowed === null || allowed.includes(p.nursery_name)),
    [plots, allowed]
  );

  const nurseryOptions = useMemo(
    () => [...new Set(visiblePlots.map((p) => p.nursery_name).filter(Boolean))].sort(),
    [visiblePlots]
  );

  // Open on the first nursery rather than on nothing: with no "All" to fall
  // back to, an empty pick would leave the whole screen blank.
  useEffect(() => {
    if (!nursery && nurseryOptions.length) setNursery(nurseryOptions[0]);
  }, [nurseryOptions, nursery]);

  /* A queued record has not reached the database, but the work HAS been done
     — so it counts for the week's ticks and shows in the list. Without this a
     Field Conductor offline would see the plot still outstanding and do it
     twice. */
  const pendingAsRecords = useMemo(() => pending.map((j) => {
    const a = j.payload || {};
    return {
      // A queued EDIT keeps the id of the row it is changing, so it stands in
      // place of that row below rather than appearing beside it as a second
      // copy of the same work.
      id: a.id != null ? a.id : 'pending:' + j.uid,
      _pendingEdit: a.id != null,
      _pending: true,
      work_date: a.date,
      plot_name: a.plot && a.plot.plot_name,
      nursery_name: a.plot && a.plot.nursery_name,
      work_type: a.workTypeKey,
      chemical: a.chemical || null,
      qty: a.qty ?? null,
      remark: a.remark || null,
      reported_by: a.reportedBy || null,
      batch_name: (a.batches || []).join(', '),
      week_no: a.weekNo || null,
      schedule_month: a.scheduleMonth || null,
      photo_urls: (a.photos || []).join(','),
    };
  }), [pending]);

  const allRecords = useMemo(() => {
    const editedIds = new Set(pendingAsRecords.filter((r) => r._pendingEdit).map((r) => r.id));
    return [...pendingAsRecords, ...records.filter((r) => !editedIds.has(r.id))];
  }, [pendingAsRecords, records]);

  // Records this user may see, then the on-screen filters.
  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allRecords.filter(
      (r) =>
        (allowed === null || allowed.includes(r.nursery_name)) &&
        (!nursery || r.nursery_name === nursery) &&
        (!q ||
          (r.plot_name || '').toLowerCase().includes(q) ||
          (r.remark || '').toLowerCase().includes(q))
    );
  }, [allRecords, allowed, nursery, query]);

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

  // Once, when the module opens. Deliberately NOT re-read after a save:
  // recording that a plot was sprayed moves no seedlings, so the balances
  // cannot have changed — and this read pages the entire inventory ledger.
  // Hanging it off the record count meant a Field Conductor working through
  // twelve plots read the whole ledger twelve times for no new information.
  useEffect(() => {
    let live = true;
    loadPlotBatches()
      .then((m) => { if (live) setBatchMap(m); })
      .catch(() => { if (live) setBatchMap(new Map()); });
    return () => { live = false; };
  }, []);

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
        isJobDone(allRecords, { workTypeKey: wt.key, plot: x.plot,
                                chemical: x.chemical, week: w, month })).length;
      return c;
    }, {});
    return acc;
  }, {}), [tasksByWeek, allRecords, month]);

  async function handleSheetSave({ task, batches, remark, photos, qty }) {
    const plot = visiblePlots.find((p) => p.plot_name === task.plot)
      || { plot_name: task.plot, nursery_name: task.nursery || nursery || null };
    setSaving(true);
    try {
      const { queued } = await submitRecord({
        plot,
        workTypeKey: sheet.workType.key,
        // Today, always: the record says the job was done, and it is being
        // written now.
        date: today,
        chemical: task.chemical,
        qty: qty || null,
        remark,
        batches,
        weekNo: sheet.week,
        scheduleMonth: month,
        reportedBy: staffName,
        photos,
      });
      if (queued) {
        flash(t('mt.savedOffline', { plot: task.plot }));
        await refreshPending();
      } else {
        flash(t('mt.savedToast', { work: workTypeLabel(sheet.workType, lang), plot: task.plot }));
        reload();
      }
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
      const { queued } = await submitRecord({
        id: editing && editing.record ? editing.record.id : null,
        plot,
        workTypeKey: form.workTypeKey,
        date: form.date,
        qty: form.qty,
        chemical: form.chemical,
        remark: form.remark,
        reportedBy: staffName,
        batches: form.batches,
        photos: form.photos,
      });
      if (queued) {
        flash(t('mt.savedOffline', { plot: plot.plot_name }));
        await refreshPending();
      } else {
        flash(t('mt.savedToast', {
          work: workTypeLabel(workTypeByKey(form.workTypeKey), lang),
          plot: plot.plot_name,
        }));
        reload();
      }
      setEditing(null);
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
          {/* One nursery at a time. "All" only ever produced a schedule the
              Field Conductor could not work through as one list. */}
          {nurseryOptions.length > 0 && (
            <select
              value={nursery}
              onChange={(e) => setNursery(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
            >
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

        {/* What has been recorded but not yet sent. Shown rather than hidden:
            a Field Conductor needs to know their morning is safe, and that it
            has not reached the office yet. */}
        {(pending.length > 0 || !online) && (
          <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
            pending.length ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-amber-500' : 'bg-slate-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-black text-slate-700">
                {pending.length ? t('mt.pendingN', { n: pending.length }) : t('mt.offline')}
              </div>
              <div className="text-[10px] font-bold text-slate-400">
                {online ? t('mt.pendingHint') : t('mt.offlineHint')}
              </div>
            </div>
            {online && pending.length > 0 && (
              <button onClick={sync} disabled={syncing}
                className="shrink-0 bg-amber-500 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest rounded-xl px-3 py-2">
                {syncing ? t('mt.syncing') : t('mt.syncNow')}
              </button>
            )}
          </div>
        )}

        {/* The week in hand, first and at full width — a Field Conductor
            opens this standing in a nursery with a job to start, not to read
            a month's plan. Only the jobs actually due appear. */}
        {!setup && schedule.length > 0 && mayRecord && (
          <>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('mt.thisWeekTitle')}
              </span>
              <span className="text-[11px] font-black text-slate-500">
                {t('mt.weekN', { n: currentWeek })} · {weekDates(currentWeek, month)}
              </span>
            </div>
            <ThisWeek
              week={currentWeek}
              counts={counts[currentWeek]}
              doneCounts={doneCounts[currentWeek]}
              onOpen={(week, workType) => setSheet({ week, workType })}
            />
          </>
        )}

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
                {t('mt.thisMonth')}
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
              <>
                {schedule.some((r) => r.carried) && (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 text-[11px] font-bold text-sky-800">
                    {t('mt.carriedFrom', {
                      month: [...new Set(schedule.filter((r) => r.carried).map((r) => r.month))].join(', '),
                    })}
                  </div>
                )}
              <Timeline
                month={month}
                currentWeek={currentWeek}
                counts={counts}
                doneCounts={doneCounts}
                onOpen={(week, workType) => setSheet({ week, workType })}
              />
              </>
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
            isDone={(task) => isJobDone(allRecords, {
              workTypeKey: sheet.workType.key, plot: task.plot,
              chemical: task.chemical, week: sheet.week, month })}
            onSave={handleSheetSave}
            onClose={() => setSheet(null)}
          />
        )}

        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-1">
          {t('mt.completed')}
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
                        {wt ? <WorkIcon workKey={wt.key} className="w-4 h-4 inline-block align-[-2px] mr-1" /> : null}{workTypeLabel(wt, lang) || r.jenis || '—'}
                      </div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        📍 {r.plot_name} · {r.nursery_name || '—'}
                      </div>
                    </div>
                    {r._pending ? (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-1">
                        ⏳ {t('mt.waiting')}
                      </span>
                    ) : r.work_date === today && (
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
                  {r.batch_name && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {String(r.batch_name).split(',').map((b) => b.trim()).filter(Boolean).map((b) => (
                        <span key={b} className="text-[10px] font-black text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.remark && (
                    <div className="text-[12px] text-slate-500 mt-1 italic break-words">{r.remark}</div>
                  )}
                  {r.photo_urls && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {String(r.photo_urls).split(',').map((u) => u.trim()).filter(Boolean).map((u) => (
                        // Opens full size in a new tab; the card only needs a thumbnail.
                        <a key={u} href={u} target="_blank" rel="noreferrer">
                          <img src={u} alt="" loading="lazy"
                               className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                        </a>
                      ))}
                    </div>
                  )}

                  {mayEdit && !r._pending && (
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
          batchMap={batchMap}
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
function EntrySheet({ record, plots, batchMap, onClose, onSave, t, lang }) {
  const [workTypeKey, setWorkTypeKey] = useState(record ? record.work_type : WORK_TYPES[0].key);
  const [plotName, setPlotName] = useState(record ? record.plot_name : '');
  const [date, setDate] = useState(record ? record.work_date : todayStr());
  const [chemical, setChemical] = useState((record && record.chemical) || '');
  const [remark, setRemark] = useState((record && record.remark) || '');
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState(
    record && record.batch_name
      ? String(record.batch_name).split(',').map((b) => b.trim()).filter(Boolean)
      : []
  );
  const [photos, setPhotos] = useState(() => {
    const a = Array(MAX_PHOTOS).fill(null);
    if (record && record.photo_urls) {
      String(record.photo_urls).split(',').map((u) => u.trim()).filter(Boolean)
        .forEach((u, i) => { if (i < MAX_PHOTOS) a[i] = u; });
    }
    return a;
  });

  // Spraying and manuring use a product; weeding by hand does not.
  const showChemical = workTypeKey === 'pd' || workTypeKey === 'manuring' || workTypeKey === 'interrow';

  // What is standing in the chosen plot, and what the ticked ones come to.
  // The quantity is that sum, not a number anyone types: the seedlings worked
  // on ARE the batches worked on, and two figures that should agree will not.
  const plotBatches = useMemo(() => batchesIn(batchMap, plotName), [batchMap, plotName]);
  const qty = useMemo(
    () => plotBatches.filter((b) => batches.includes(b.batch))
                     .reduce((sum, b) => sum + Number(b.qty || 0), 0),
    [plotBatches, batches]
  );
  const toggleBatch = (name) =>
    setBatches((b) => (b.includes(name) ? b.filter((x) => x !== name) : [...b, name]));

  // A plot the record was made against but which no longer holds that batch
  // still has to show it, or editing the record would silently drop it.
  const strays = batches.filter((b) => !plotBatches.some((x) => x.batch === b));

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
              <WorkIcon workKey={w.key} className="w-6 h-6" />
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
          {t('mt.batchesInPlot')}
        </label>
        {!plotName ? (
          <div className="text-[12px] font-bold text-slate-400 mb-3">{t('mt.pickPlotFirst')}</div>
        ) : plotBatches.length === 0 && !strays.length ? (
          <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
            {t('mt.noBatches', { plot: plotName })}
          </div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {plotBatches.map((b) => (
              <label key={b.batch}
                className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer ${
                  batches.includes(b.batch) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <input type="checkbox" className="w-5 h-5 accent-emerald-600 shrink-0"
                  checked={batches.includes(b.batch)} onChange={() => toggleBatch(b.batch)} />
                <span className="font-black text-slate-800 text-[14px] flex-1 min-w-0">{b.batch}</span>
                <span className={`text-[12px] font-bold shrink-0 tabular-nums ${
                  b.qty < 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {b.qty.toLocaleString()}
                </span>
              </label>
            ))}
            {strays.map((b) => (
              <label key={b}
                className="flex items-center gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 accent-emerald-600 shrink-0"
                  checked onChange={() => toggleBatch(b)} />
                <span className="font-black text-slate-800 text-[14px] flex-1 min-w-0">{b}</span>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{t('mt.batchGone')}</span>
              </label>
            ))}
          </div>
        )}

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.qty')} <span className="text-slate-400 normal-case">· {t('mt.qtyFromBatches')}</span>
        </label>
        <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-3 text-sm font-black text-slate-700 mb-3">
          {qty ? qty.toLocaleString() : '—'}
        </div>

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('mt.photos', { n: MAX_PHOTOS })}
        </label>
        <div className="mb-3">
          <PhotoSlots value={photos} onChange={setPhotos} max={MAX_PHOTOS} />
        </div>

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
            await onSave({ workTypeKey, plotName, date, qty, chemical: chemical.trim(),
                           remark: remark.trim(), batches, photos: photos.filter(Boolean) });
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
