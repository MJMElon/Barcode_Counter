import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../context/LanguageContext.jsx';
import { compressImage, dataUrlBytes } from '../../lib/image.js';
import { workTypeLabel } from './helpers.js';
import { batchesIn } from './plotBatches.js';
import WorkIcon from './WorkIcons.jsx';

/** Enough to show the work from more than one angle, few enough that a
    morning in the field does not turn into a bill for storage. */
const MAX_PHOTOS = 3;

/* A job is a plot AND what is being put on it: P & D is two sprays on the
   same plot on the same day, and each is recorded on its own. */
const taskKey = (x) => `${x ? x.plot : ''}|${(x && x.chemical) || ''}`;

/* "Antracol 50gm + Bond 15mL" → "Antracol". Just enough to tell one spray
   from the other on a chip the size of a thumb. */
const shortChemical = (c) => String(c || '').split(/\s*\+\s*/)[0].replace(/\s+[\d.].*$/, '');

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M9.4 4h5.2l1.1 1.8H20a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2h4.3L9.4 4Zm2.6 4.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm0 2a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" />
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M11 15.4V6.8l-2.9 2.9-1.4-1.4L12 3l5.3 5.3-1.4 1.4L13 6.8v8.6h-2ZM4 17h2v2.4h12V17h2v2.4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V17Z" />
  </svg>
);

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
  const [photos, setPhotos] = useState([]);    // shrunk JPEG data URLs
  const [busy, setBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const camRef = useRef(null);
  const fileRef = useRef(null);

  // Open on the first plot still to do; if they are all done, the first one.
  useEffect(() => {
    const next = tasks.find((x) => !isDone(x)) || tasks[0] || null;
    setPlot(next);
    setBatches([]);
    setRemark('');
    setPhotos([]);
    setPhotoErr('');
  }, [workType.key, week]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Plots the schedule asks for twice this week — the pest spray and the
  // disease spray. Only those chips need the chemical spelt out under them.
  const twiceOver = useMemo(() => {
    const seen = new Set(), twice = new Set();
    tasks.forEach((x) => { if (seen.has(x.plot)) twice.add(x.plot); else seen.add(x.plot); });
    return twice;
  }, [tasks]);

  const full = photos.length >= MAX_PHOTOS;
  const photoBytes = useMemo(() => photos.reduce((s, p) => s + dataUrlBytes(p), 0), [photos]);

  async function addPhotos(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = '';          // so the same photo can be chosen twice
    if (!picked.length) return;
    setBusy(true);
    setPhotoErr('');
    const room = MAX_PHOTOS - photos.length;
    const taken = picked.slice(0, room);
    const done = [];
    for (const f of taken) {
      try { done.push(await compressImage(f)); }
      catch { setPhotoErr(t('mt.photoFailed')); }
    }
    if (picked.length > room) setPhotoErr(t('mt.photoMax', { n: MAX_PHOTOS }));
    setPhotos((p) => [...p, ...done]);
    setBusy(false);
  }

  const dropPhoto = (i) => setPhotos((p) => p.filter((_, j) => j !== i));

  const plotBatches = useMemo(
    () => (plot ? batchesIn(batchMap, plot.plot) : []),
    [batchMap, plot]
  );

  function pick(task) {
    setPlot(task);
    setBatches([]);
    setRemark('');
    setPhotos([]);
    setPhotoErr('');
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
              {tasks.map((x, i) => {
                const done = isDone(x);
                const on = plot && taskKey(plot) === taskKey(x);
                return (
                  <button key={taskKey(x) + i} onClick={() => pick(x)}
                    className={`px-3 py-2 rounded-xl text-[13px] font-black border-2 transition-colors text-left ${
                      on ? 'bg-emerald-600 text-white border-emerald-700'
                         : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-slate-700 border-slate-200'}`}>
                    {done ? '✓ ' : ''}{x.plot}
                    {twiceOver.has(x.plot) && x.chemical && (
                      <span className={`block text-[9px] font-bold leading-tight ${
                        on ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {shortChemical(x.chemical)}
                      </span>
                    )}
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

            {/* Proof the work was done. Shrunk on the phone before it is
                uploaded — see lib/image.js — so a morning's records cost
                kilobytes rather than tens of megabytes. */}
            <div>
              <span className={label}>{t('mt.photos', { n: MAX_PHOTOS })}</span>
              <div className="flex gap-2">
                <button type="button" disabled={full || busy}
                  onClick={() => camRef.current && camRef.current.click()}
                  className="flex-1 rounded-xl border-2 border-slate-200 disabled:opacity-40 py-2.5 text-[12px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-center gap-2">
                  <CameraIcon /> {t('mt.takePhoto')}
                </button>
                <button type="button" disabled={full || busy}
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="flex-1 rounded-xl border-2 border-slate-200 disabled:opacity-40 py-2.5 text-[12px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-center gap-2">
                  <UploadIcon /> {t('mt.uploadPhoto')}
                </button>
              </div>
              {/* capture= asks for the camera; without it the picker opens. */}
              <input ref={camRef} type="file" accept="image/*" capture="environment"
                     multiple className="hidden" onChange={addPhotos} />
              <input ref={fileRef} type="file" accept="image/*"
                     multiple className="hidden" onChange={addPhotos} />

              {busy && (
                <div className="mt-2 text-[11px] font-bold text-slate-400">{t('mt.shrinking')}</div>
              )}
              {photoErr && (
                <div className="mt-2 text-[11px] font-bold text-amber-700">{photoErr}</div>
              )}
              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p} alt="" className="w-20 h-20 object-cover rounded-xl border-2 border-slate-200" />
                      <button type="button" onClick={() => dropPhoto(i)}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-800 text-white text-[12px] font-black leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length > 0 && (
                <div className="mt-1 text-[10px] font-bold text-slate-400">
                  {t('mt.photoSize', { kb: Math.round(photoBytes / 1024).toLocaleString() })}
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
              disabled={saving || busy}
              onClick={() => onSave({ task: plot, batches, remark, photos })}
              className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[13px] py-3.5">
              {saving ? t('common.saving') : isDone(plot) ? t('mt.saveAgain') : t('mt.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
