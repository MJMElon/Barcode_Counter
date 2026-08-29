import { useRef, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { workTypeByKey, workTypeLabel } from '../modules/maintenance/helpers.js';
import { tintOf } from '../modules/maintenance/tints.js';
import WorkIcon from '../modules/maintenance/WorkIcons.jsx';
import { formatDistance, formatDuration } from '../modules/maintenance/track/track.js';

/** How far left the row must be dragged before letting go finishes the job. */
const COMMIT_PX = 84;
/** How wide the panel is, and so how far the thumb can pull it in. */
const MAX_PX = 112;

/**
 * One job on the list: what to do, where, with what — and the two ways to
 * finish it.
 *
 * ── Swipe left ──
 *
 * The whole row is the target, because a worker is doing this one-handed with
 * a knapsack sprayer in the other, and a button the size of a thumbnail is a
 * button they will miss. Dragging past COMMIT_PX and letting go records the
 * job. Letting go short of it springs back and leaves a green DONE panel
 * standing open, which is itself tappable — a swipe that did not go far enough
 * should not mean starting again, and it must not mean the row silently did
 * nothing.
 *
 * The thumb pulls the PANEL in from the right; the row itself does not move.
 * Sliding the row the way a mail app does took the icon and the plot name off
 * the left edge, which left a green DONE button beside a row that no longer
 * said which job it was about to finish. What the panel covers instead is the
 * row's own buttons, which have nothing to say while it is open anyway.
 *
 * Pointer events, not touch: the same handler then works under a thumb, under
 * a mouse, and under a test, instead of the row being untestable and dead on
 * anything that is not a phone.
 *
 * ── Start / Pause / Stop ──
 *
 * Start walks a GPS track for this job. Start becomes PAUSE once it is
 * running, because that is the button the thumb is already over; STOP appears
 * beside it and does what the name says AND finishes the job, saving the walk
 * with the record. That is the whole point of having walked it.
 *
 * The map button opens the satellite view — the nursery outline, where the
 * phone is, and the line walked so far, growing as it is walked. It only ever
 * looks: the walk is run from these buttons, and a second Start on the map
 * would be a rival recording of the same job.
 */
export default function TaskRow({
  task, tint, tracking, session, elapsed, denied, busy,
  onStart, onPause, onResume, onStop, onComplete, onMap,
}) {
  const { t, lang } = useLang();
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);   // the DONE panel, left standing
  const from = useRef(null);
  const moved = useRef(false);

  const wt = workTypeByKey(task.workTypeKey);
  const tone = tint || tintOf(task.workTypeKey);

  const down = (e) => {
    if (busy) return;
    from.current = e.clientX;
    moved.current = false;
  };
  const move = (e) => {
    if (from.current == null) return;
    const d = e.clientX - from.current;
    if (d < -4) moved.current = true;
    setDx(Math.max(-MAX_PX, Math.min(0, d)));
  };
  const up = () => {
    if (from.current == null) return;
    const d = dx;
    from.current = null;
    setDx(0);
    if (d <= -COMMIT_PX) { setOpen(false); onComplete(); return; }
    /* Short of the line: leave the panel open rather than snapping shut. The
       swipe was an attempt to finish the job, and answering it with nothing at
       all is how somebody decides the app is broken. */
    setOpen(d < -12);
  };

  /* A tap does nothing but shut the DONE panel if it is standing open.
   *
   * It used to open the full record form, and that was wrong. A swipe the
   * browser judged too small to be a drag is a tap, and so is a thumb landing
   * a little heavily — so finishing a job would every so often throw the
   * worker onto the FC Portal's month planner, which is the one screen this
   * portal exists to keep them off. A gesture nobody asked for must not be
   * able to change which app you appear to be in. There is no other screen to
   * be thrown onto now — the full form has gone — but the rule stands. */
  const click = () => {
    /* A drag is followed by a click on the way up, so a swipe that left the
       panel standing open would otherwise shut it again in the same gesture. */
    if (moved.current) { moved.current = false; return; }
    if (open) setOpen(false);
  };

  const why = session && session.why;
  /* How far the panel has come in. While a thumb is down it follows the drag;
     once it is lifted it is either shut or standing open. */
  const pulled = from.current != null ? -dx : (open ? MAX_PX : 0);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={click}
        style={{ touchAction: 'pan-y' }}
        className={`relative bg-white border border-slate-200 rounded-2xl px-3.5 py-3
                    shadow-[0_2px_10px_rgba(0,0,0,.05)] select-none
                    ${busy ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-3">
          <span className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${tone.bg}`}>
            <WorkIcon workKey={task.workTypeKey} className={`w-7 h-7 ${tone.fg}`} />
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[17px] font-black text-slate-800 leading-none">{task.plot}</span>
              {task.nursery && (
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                  {task.nursery}
                </span>
              )}
            </div>
            <div className={`text-[12px] font-black mt-1 leading-tight ${tone.fg}`}>
              {workTypeLabel(wt, lang)}
            </div>
            {/* The chemical and its dose, exactly as the office planned them.
                Nobody types this — that is what makes the row a to-do and not
                a form. */}
            {task.chemical && (
              <div className="text-[12px] font-bold text-slate-500 mt-0.5 leading-snug break-words">
                {task.chemical}
              </div>
            )}

            {tracking && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  session.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="text-[12px] font-black text-slate-700 tabular-nums">
                  {formatDistance(session.distance)} · {formatDuration(elapsed)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                  {t('wk.trkPointsN', { n: session.points.length })}
                </span>
                {session.status === 'paused' && (
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                    {t('wk.paused')}
                  </span>
                )}
                {denied && (
                  <span className="text-[10px] font-black text-red-500">{t('wk.gpsDenied')}</span>
                )}
                {!denied && why && (
                  <span className="text-[10px] font-bold text-slate-400">{t(`wk.trk_${why}`)}</span>
                )}
              </div>
            )}
          </div>

          {/* Big enough to hit with a thumb. The CLICK is stopped, so pressing
              Start never also opens the form — but the pointer-DOWN is not,
              deliberately: the buttons sit on the right of the row, which is
              exactly where a right-handed thumb begins a leftward swipe, and
              swallowing the press there made the swipe do nothing at all from
              the most natural place to start it. A drag that leaves the button
              never becomes a click on it, so both gestures still work. */}
          <div
            className={`flex flex-col gap-1.5 shrink-0 transition-opacity ${
              pulled > 12 ? 'opacity-0 pointer-events-none' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* No Start at all when the office has not given this worker GPS.
                A button that refuses is worse than no button. */}
            {!tracking && onStart && (
              <button
                type="button" onClick={onStart} disabled={busy}
                className="bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white
                           font-black text-[11px] uppercase tracking-widest rounded-xl px-3.5 py-2.5"
              >
                ▶ {t('wk.start')}
              </button>
            )}
            {tracking && session.status === 'running' && (
              <button
                type="button" onClick={onPause} disabled={busy}
                className="bg-amber-500 active:bg-amber-600 disabled:opacity-50 text-white
                           font-black text-[11px] uppercase tracking-widest rounded-xl px-3.5 py-2.5"
              >
                ⏸ {t('wk.pause')}
              </button>
            )}
            {tracking && session.status === 'paused' && (
              <button
                type="button" onClick={onResume} disabled={busy}
                className="bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white
                           font-black text-[11px] uppercase tracking-widest rounded-xl px-3.5 py-2.5"
              >
                ▶ {t('wk.resume')}
              </button>
            )}
            {tracking && (
              <button
                type="button" onClick={onStop} disabled={busy}
                className="bg-slate-800 active:bg-slate-900 disabled:opacity-50 text-white
                           font-black text-[11px] uppercase tracking-widest rounded-xl px-3.5 py-2.5"
              >
                ⏹ {t('wk.stop')}
              </button>
            )}
            {/* Worded like the buttons above it, not an icon on its own. The
                people using this are not reading a symbol set — every other
                control on the row says what it does, and this one should. */}
            {onMap && (
              <button
                type="button" onClick={onMap}
                aria-label={t('wk.openMap')}
                className="bg-white border border-slate-200 active:bg-slate-50 text-slate-600
                           font-black text-[11px] uppercase tracking-widest rounded-xl px-3.5 py-2.5"
              >
                🗺️ {t('wk.openMap')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pulled in from the right by the thumb, and tappable once it is
          showing. `pulled` is how far in it has come: 0 shut, MAX_PX open. */}
      <button
        type="button"
        onClick={() => { setOpen(false); onComplete(); }}
        aria-label={t('wk.markDone')}
        style={{ transform: `translateX(${MAX_PX - pulled}px)`,
                 transition: from.current ? 'none' : 'transform .18s ease-out' }}
        className={`absolute inset-y-0 right-0 w-[112px] bg-emerald-600 text-white
                    rounded-2xl flex flex-col items-center justify-center gap-0.5
                    cursor-pointer ${pulled > 12 ? '' : 'pointer-events-none'}`}
      >
        <span className="text-[19px] leading-none" aria-hidden="true">✓</span>
        <span className="text-[10px] font-black uppercase tracking-widest">{t('wk.markDone')}</span>
      </button>
    </div>
  );
}
