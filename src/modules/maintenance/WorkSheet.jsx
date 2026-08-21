import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../../context/LanguageContext.jsx';
import { workTypeLabel } from './helpers.js';
import { batchesIn } from './plotBatches.js';
import WorkIcon from './WorkIcons.jsx';

/**
 * Recording one job from the schedule.
 *
 * The plots the office asked for are listed at the top — tap one and the form
 * below fills itself in. Date, work, chemical and plot all come from the
 * schedule and cannot be typed over: the Field Conductor is confirming the job
 * was done, not deciding what it was. The only two things they enter are which
 * batches were in the plot and a remark.
 */
export default function WorkSheet({
  workType, week, weekDates, month, tasks, batchMap, isDone, today, saving, onSave, onClose,
}) {
  const { t, lang } = useLang();
  const [plot, setPlot] = useState(null);      // the task being recorded
  const [batches, setBatches] = useState([]);
  const [remark, setRemark] = useState('');

  // Open on the first plot still to do; if they are all done, the first one.
  useEffect(() => {
    const next = tasks.find((x) => !isDone(x.plot)) || tasks[0] || null;
    setPlot(next);
    setBatches([]);
    setRemark('');
  }, [workType.key, week]);   // eslint-disable-line react-hooks/exhaustive-deps

  const plotBatches = useMemo(
    () => (plot ? batchesIn(batchMap, plot.plot) : []),
    [batchMap, plot]
  );

  function pick(task) {
    setPlot(task);
    setBatches([]);
    setRemark('');
  }

  const toggleBatch = (name) =>
    setBatches((b) => (b.includes(name) ? b.filter((x) => x !== name) : [...b, name]));

  const field = 'w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-[14px] font-bold text-slate-700';
  const label = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
           onClick={(e) => e.stopPropagation()}>

        {/* What and when */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
            <WorkIcon workKey={workType.key} className="w-7 h-7 text-slate-700" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-black text-slate-800 leading-tight">
              {workTypeLabel(workType, lang)}
            </h3>
            <div className="text-[11px] font-bold text-slate-400">
              {t('mt.weekN', { n: week })} · {weekDates} · {month}
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 font-black shrink-0">✕</button>
        </div>

        {/* The plots the schedule asks for */}
        <div className="px-5 pt-4">
          <div className={label}>{t('mt.plotsToDo', { n: tasks.length })}</div>
          {tasks.length === 0 ? (
            <div className="text-[13px] font-bold text-slate-400 py-2">{t('mt.nothingDue')}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tasks.map((x) => {
                const done = isDone(x.plot);
                const on = plot && plot.plot === x.plot;
                return (
                  <button key={x.plot} onClick={() => pick(x)}
                    className={`px-3 py-2 rounded-xl text-[13px] font-black border-2 transition-colors ${
                      on ? 'bg-emerald-600 text-white border-emerald-700'
                         : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-slate-700 border-slate-200'}`}>
                    {done ? '✓ ' : ''}{x.plot}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {plot && (
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>{t('mt.date')}</span>
                {/* Today, as the form is filled in. Not editable: a record is
                    what happened today, not a date someone can move. */}
                <div className={field}>{today}</div>
              </div>
              <div>
                <span className={label}>{t('mt.plot')}</span>
                <div className={field}>{plot.plot}</div>
              </div>
            </div>
            <div>
              <span className={label}>{t('mt.work')}</span>
              <div className={field}>{workTypeLabel(workType, lang)}</div>
            </div>
            <div>
              <span className={label}>{t('mt.chemical')}</span>
              <div className={field}>{plot.chemical || t('mt.noChemical')}</div>
            </div>

            {/* The only real choice on this form */}
            <div>
              <span className={label}>{t('mt.batchesInPlot')}</span>
              {plotBatches.length === 0 ? (
                <div className="text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  {t('mt.noBatches', { plot: plot.plot })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {plotBatches.map((b) => (
                    <label key={b.batch}
                      className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer ${
                        batches.includes(b.batch) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                      <input type="checkbox" className="w-5 h-5 accent-emerald-600 shrink-0"
                        checked={batches.includes(b.batch)}
                        onChange={() => toggleBatch(b.batch)} />
                      <span className="font-black text-slate-800 text-[14px] flex-1 min-w-0">{b.batch}</span>
                      {/* A negative balance is the office's own figure — the
                          movement report shows it too. Marked so it reads as
                          a number to query, not as stock standing there. */}
                      <span className={`text-[12px] font-bold shrink-0 tabular-nums ${
                        b.qty < 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {b.qty.toLocaleString()}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className={label}>{t('mt.remark')}</span>
              <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)}
                placeholder={t('mt.remarkHint')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] font-semibold text-slate-800 outline-none focus:border-emerald-500" />
            </div>

            <button
              disabled={saving}
              onClick={() => onSave({ task: plot, batches, remark })}
              className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[13px] py-3.5">
              {saving ? t('common.saving') : isDone(plot.plot) ? t('mt.saveAgain') : t('mt.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
