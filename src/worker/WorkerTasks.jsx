import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { withQueued } from '../modules/maintenance/data.js';
import { todayStr, workTypeByKey, workTypeLabel } from '../modules/maintenance/helpers.js';
import {
  daysInMonthLabel, monthLabelOf, weekOfDate,
} from '../modules/maintenance/schedule.js';
import { tintOf } from '../modules/maintenance/tints.js';
import WorkIcon from '../modules/maintenance/WorkIcons.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import WorkerGround from './WorkerGround.jsx';
import WorkerNav from './WorkerNav.jsx';
import {
  makeWorkerMaintSource, workerPermissions, workerPlotFilter,
} from './workerMaintSource.js';
import { canMaintFn } from '../modules/maintenance/functions.js';
import { periodLabel, periodTasks, splitDone } from './workerTasks.js';
import DoneSheet from './DoneSheet.jsx';
import PocketMode from './PocketMode.jsx';
import TaskRow from './TaskRow.jsx';
import { useWorkerTrack } from './useWorkerTrack.js';

/* The map brings Leaflet with it, and Leaflet is most of a megabyte. Pulled
   down only when somebody asks to look — the same arrangement the FC Portal's
   GpsTrack uses, for the same reason. */
const TrackMap = lazy(() => import('../modules/maintenance/track/TrackMap.jsx'));

/**
 * The Worker Portal, as a to-do list.
 *
 * A worker signs in and sees the jobs the office asked for in the period they
 * are standing in — plot, work, chemical and dose — and finishes them by
 * swiping. There is no month planner, no nursery to pick, no form to fill in:
 * everything a record needs is already in the schedule, which is what makes
 * "zero typing" possible rather than a slogan.
 *
 * ── Why this is not MaintenanceModule with a flag ──
 *
 * It is the same DATA and the same rules — the same source, the same schedule
 * reader, the same isDone, the same outbox, the same access checks — and none
 * of that is re-implemented here. What differs is the shape of the screen, and
 * those are genuinely different jobs: a Field Conductor plans a month across
 * four weeks and several nurseries, a worker works down today's list. Bolting
 * a second full layout into an eleven-hundred-line component would have made
 * both harder to change than keeping the layouts apart and the rules shared.
 *
 * There is no full form behind this any more, and no way to reach one. It was
 * there for a job nobody scheduled, and it was the FC Portal's month planner
 * wearing this portal's ribbon — a second screen, with a second set of rules,
 * that a worker only ever arrived at by accident. Work that is not on the plan
 * is the office's to add to the plan.
 */
export default function WorkerTasks() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { token, worker, boundary, actions, company, modules } = useWorker();
  const online = useOnline();

  const source = useMemo(() => makeWorkerMaintSource(token), [token]);
  const permissions = useMemo(
    () => workerPermissions(boundary, actions, company), [boundary, actions, company]);
  const plotFilter = useMemo(() => workerPlotFilter(boundary), [boundary]);

  const mayGps = canMaintFn(permissions, 'gps');

  const [plots, setPlots] = useState([]);
  const [records, setRecords] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);      // the task id being saved
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [pocket, setPocket] = useState(false);
  const [openDone, setOpenDone] = useState(null);   // a finished job, opened

  /* Watching even while nothing is running, so the list knows how good the
     fix is BEFORE Start is pressed. Only asked for when this worker has GPS at
     all — nobody else's battery pays for a number they will never see. */
  const track = useWorkerTrack(mayGps);

  const today = todayStr();
  const month = monthLabelOf(today);
  const week = weekOfDate(today);

  const refreshPending = useCallback(async () => {
    try { setPending(await source.pending()); } catch (_) { setPending([]); }
  }, [source]);

  const reload = useCallback(async () => {
    try {
      const [{ plots: p, records: r }, s] = await Promise.all([
        source.loadData(),
        source.loadSchedules(null, month),
      ]);
      setPlots(p);
      setRecords(r);
      setSchedule(s);
      setError(null);
    } catch (e) {
      /* Offline is not an error here — the list is drawn from what was
         already read, and a worker in a plot with no signal still has one. */
      setError((e && e.message) || String(e));
    } finally {
      setLoading(false);
    }
  }, [source, month]);

  useEffect(() => { reload(); refreshPending(); }, [reload, refreshPending]);

  /* Anything the outbox is still holding counts as done. Without this a
     worker who finished a plot with no signal sees it back on the list and
     does it twice — which is the one failure this screen must not have. */
  const allRecords = useMemo(() => withQueued(records, pending), [records, pending]);

  const tasks = useMemo(
    () => periodTasks(schedule, week, { plotFilter }), [schedule, week, plotFilter]);
  const { todo, done } = useMemo(
    () => splitDone(tasks, allRecords, { week, month }), [tasks, allRecords, week, month]);

  const label = periodLabel(week, month, daysInMonthLabel(month));

  /* The record behind a finished task — the row the summary is drawn from.
     Matched the same way isDone matches, so a task shown as done always has
     one to open. Newest first, because a plot sprayed twice in a block should
     open on the spray that was just walked. */
  const recordFor = useCallback((task) => {
    const want = (r) =>
      r.work_type === task.workTypeKey
      && r.plot_name === task.plot
      && (!task.chemical || !r.chemical || r.chemical === task.chemical
          || String(r.chemical).indexOf(task.chemical) !== -1);
    const hits = allRecords.filter(want);
    return hits.length ? hits[0] : null;
  }, [allRecords]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try { await source.flushQueue(); } catch (_) { /* try again next time */ }
    await refreshPending();
    await reload();
    setSyncing(false);
  }, [source, syncing, refreshPending, reload]);

  // A quiet retry every minute, so a worker walking back into signal does not
  // have to know there is anything to press.
  useEffect(() => {
    if (!online || !pending.length) return undefined;
    const id = setInterval(() => { sync(); }, 60000);
    return () => clearInterval(id);
  }, [online, pending.length, sync]);

  /**
   * Finish a job: write the record the schedule already describes.
   *
   * Nothing is asked for, because nothing is missing. The plot, the work, the
   * chemical and its dose are the office's plan; the date is today, because
   * the job is being finished now; the name is whoever's PIN opened the app.
   * `gps` is the walk, when there was one.
   */
  const complete = useCallback(async (task, gps = null) => {
    setBusy(task.id);
    const plot = plots.find((p) => p.plot_name === task.plot)
      || { plot_name: task.plot, nursery_name: task.nursery || null };
    try {
      const { queued } = await source.submitRecord({
        plot,
        workTypeKey: task.workTypeKey,
        date: today,
        chemical: task.chemical || null,
        qty: null,
        remark: null,
        batches: [],
        weekNo: week,
        scheduleMonth: month,
        reportedBy: worker ? worker.name : '',
        workedBy: [],
        photos: [],
        gps,
      });
      setToast(queued ? t('wk.doneOffline', { plot: task.plot })
                      : t('wk.doneSaved', { plot: task.plot }));
      await refreshPending();
      if (!queued) await reload();
    } catch (e) {
      setToast((e && e.message) || t('wk.saveFailed'));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 2600);
    }
  }, [plots, source, today, week, month, worker, t, refreshPending, reload]);

  /* Start does both: it begins the walk AND puts the phone away. Pressing two
     buttons to do one thing is two chances to press only the first, and the
     one that would be missed is the one that saves the battery. Coming back
     out is a hold, and Pocket is on the row for going in again. */
  const startTrack = (task) => {
    if (!mayGps) return;
    track.start({ workTypeKey: task.workTypeKey, plot: task.plot,
                  chemical: task.chemical, nursery: task.nursery });
    setPocket(true);
  };
  /* Stop saves. It is what the button is for: a walk nobody records is a
     battery spent on nothing. */
  const stopTrack = (task) => complete(task, track.stop());

  /* The map only ever looks. The walk is run from the row's own buttons, and
     the map is handed it so the line grows while it is watched — a second
     Start there would be a rival recording of the same job. */
  const live = track.session
    ? { points: track.session.points, distance: track.session.distance,
        startedAt: track.session.startedAt, running: track.running }
    /* An empty walk, not null. Null is what a FINISHED job's map is opened
       with — there the line comes from the record and the map must not be
       told to draw nothing over it. Opening the map from a row with nothing
       running is a different sentence, and it should read as one. */
    : { points: [], distance: 0, startedAt: null, running: false };

  const head = 'text-[10px] font-black text-slate-400 uppercase tracking-widest';

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      {/* The FC Portal's page ribbon: the name on the left over the portal it
          belongs to, and the controls on the right. Not the dashboard's
          centred 555 book — that is the front of an app, and this is a screen
          inside one. */}
      <WorkerNav
        title={t('wk.tasksTitle')}
        onSettings={modules.settings ? () => navigate('/worker/settings') : null}
      />
      <WorkerGround />

      {/* A walk is running and the worker has come back to look at the list.
          This is the way back into the dark screen — the shape a phone uses
          for a call in progress, because it is the same situation: something
          is running that this screen is not showing.

          It replaced a fourth button on every row. Putting the phone away is
          not a property of one job among four; it is the state the phone is
          in, and it belongs at the top where that state is announced. */}
      {track.running && !pocket && (
        <button
          type="button"
          onClick={() => setPocket(true)}
          className="w-full bg-rose-700 active:bg-rose-800 text-white px-4 py-2.5
                     flex items-center gap-2.5 sticky top-0 z-20"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white/90 animate-pulse shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest truncate">
            {t('wk.backToPocket', { plot: track.session ? track.session.task.plot : '' })}
          </span>
        </button>
      )}

      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-3 space-y-3 pb-24">
        {/* The period, spelt out. A list with no dates on it is a list somebody
            will work through in the wrong week. */}
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <span className={head}>{t('wk.thisPeriod')}</span>
          <span className="text-[12px] font-black text-slate-600 tabular-nums">
            {t('mt.weekN', { n: week })} · {label}
          </span>
        </div>

        {/* Anything the queue is still holding, and whether there is signal. */}
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

        {loading && (
          <div className="text-center py-10 text-[12px] font-black text-slate-400 uppercase tracking-widest">
            {t('common.loading')}
          </div>
        )}

        {!loading && !todo.length && (
          <div className="bg-emerald-50 rounded-3xl px-5 py-7 text-center">
            <div className="text-[15px] font-black text-emerald-700">
              {done.length ? t('wk.periodClear') : t('wk.periodEmpty')}
            </div>
          </div>
        )}

        {!loading && todo.length > 0 && (
          <>
            <div className="text-[10.5px] font-bold text-slate-400 -mt-1">{t('wk.swipeHint')}</div>
            {/* Said only while a walk is running, and said because it is the
                one thing about the track a worker cannot work out for
                themselves: a phone that locks stops giving positions, and the
                line simply stops growing. The app holds the screen awake
                while it can, but a worker who pockets the phone should know
                what they are risking. */}
            {track.running && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2
                              text-[11px] font-bold text-amber-800 leading-snug">
                {t('wk.keepScreenOn')}
              </div>
            )}
            {/* Why Start is grey. Said once, above the list, rather than on
                every row — it is the same answer for all of them, and it is
                about the phone, not about any one job. */}
            {mayGps && !track.running && !track.canStart && (
              <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2
                              text-[11px] font-bold text-slate-500 leading-snug">
                {track.denied ? t('wk.gpsDenied')
                 : track.accuracy == null ? t('mt.trkWaitingFix')
                 : t('mt.trkTooRough', { acc: track.accuracy, need: track.needAccuracy })}
              </div>
            )}
            <div className="space-y-2.5">
              {todo.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  tint={tintOf(task.workTypeKey)}
                  tracking={track.trackingId === task.id}
                  session={track.trackingId === task.id ? track.session : null}
                  elapsed={track.elapsed}
                  denied={track.denied}
                  busy={busy === task.id}
                  onStart={mayGps ? () => startTrack(task) : null}
                  onPause={track.pause}
                  onResume={track.resume}
                  onStop={() => stopTrack(task)}
                  onComplete={() => complete(task, track.trackingId === task.id ? track.stop() : null)}
                  onMap={mayGps ? () => setMapOpen(true) : null}
                  canStart={track.canStart}
                />
              ))}
            </div>
          </>
        )}

        {/* What has been finished this period. Kept on screen rather than
            vanishing: a worker wants to see the morning behind them, and it is
            the only proof the swipe did anything. */}
        {!loading && done.length > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-2 pt-3">
              <span className={head}>{t('wk.completed')}</span>
              <span className="text-[12px] font-black text-emerald-600 tabular-nums">
                {done.length}/{tasks.length}
              </span>
            </div>
            <div className="text-[10.5px] font-bold text-slate-400 -mt-1">{t('wk.tapDone')}</div>
            <div className="space-y-1.5">
              {done.map((task) => {
                const tone = tintOf(task.workTypeKey);
                const rec = recordFor(task);
                return (
                  <button key={task.id} type="button"
                    onClick={() => rec && setOpenDone({ record: rec, task })}
                    className="w-full text-left bg-white/70 border border-slate-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 active:bg-white">
                    <span className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${tone.bg} opacity-60`}>
                      <WorkIcon workKey={task.workTypeKey} className={`w-5 h-5 ${tone.fg}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-slate-500 leading-none">
                        {task.plot}
                        <span className="ml-2 text-[11px] font-bold text-slate-400">
                          {workTypeLabel(workTypeByKey(task.workTypeKey), lang)}
                        </span>
                      </div>
                      {task.chemical && (
                        <div className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                          {task.chemical}
                        </div>
                      )}
                    </div>
                    <span className="text-emerald-600 text-[16px] font-black shrink-0" aria-hidden="true">✓</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error && !loading && !tasks.length && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-bold text-slate-500">
            {error}
          </div>
        )}

      </div>

      {/* The phone in a pocket, still walking. Closes itself if the walk ends
          from anywhere else, so it can never be a black screen over nothing. */}
      {pocket && track.session && (
        <PocketMode
          task={track.session.task}
          session={track.session}
          elapsed={track.elapsed}
          /* The map, without coming back to the list first — and it stays
             recording while it is looked at. Closing the map drops back into
             the pocket screen, which is where the phone was. */
          onMap={() => setMapOpen(true)}
          onExit={() => setPocket(false)}
        />
      )}

      {mapOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[60] bg-slate-900 grid place-items-center">
            <div className="text-emerald-400 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">
              {t('common.loading')}
            </div>
          </div>
        }>
          <TrackMap viewOnly live={live} onClose={() => setMapOpen(false)} onDone={() => setMapOpen(false)} />
        </Suspense>
      )}

      {openDone && (
        <DoneSheet
          record={openDone.record}
          task={openDone.task}
          source={source}
          onClose={() => setOpenDone(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white
                        text-[12.5px] font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
