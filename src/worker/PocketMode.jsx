import { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { formatDistance, formatDuration } from '../modules/maintenance/track/track.js';

/** How long the finger must stay down to get out again. */
const HOLD_MS = 1200;

/**
 * The phone, in a pocket, still recording.
 *
 * ── Why this exists, and what it is not ──
 *
 * A browser stops giving positions the moment the page is not on screen. Not
 * throttles — stops. So "keep recording with the screen off" is not something
 * this app can be made to do; only an app installed from the store can, and
 * that is a different piece of work.
 *
 * What costs the battery is not the screen being ON, it is the screen being
 * BRIGHT. This is the screen on and showing almost nothing: black, a handful
 * of dim characters, no map, no tiles, no animation beyond one small dot. On
 * the OLED panels these phones have, a black pixel is an unlit pixel, so the
 * panel draws a fraction of what the task list draws — near enough to the
 * screen being off that a morning's walk is not a flat phone by lunchtime.
 * (On an older LCD it saves less, because the backlight is on regardless.)
 *
 * ── Why it cannot simply be tapped away ──
 *
 * A phone in a trouser pocket presses itself against a leg all morning. If
 * this shut on a tap, it would shut, the task list would be underneath, and
 * the pocket would swipe a row done or press Stop on the walk. So every touch
 * is swallowed, and the only way out is holding a finger still for a second —
 * which is a thing a pocket does not do.
 */
export default function PocketMode({ task, session, elapsed, onExit, onMap }) {
  const { t } = useLang();
  // Which target is being held, and how far through: 'back' | 'map' | null.
  const [hold, setHold] = useState(null);
  const timerRef = useRef(null);
  const startRef = useRef(0);

  // Nothing underneath may be scrolled or pressed while this is up.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = was; };
  }, []);

  const stopHold = () => {
    if (timerRef.current) { cancelAnimationFrame(timerRef.current); timerRef.current = null; }
    setHold(null);
  };

  /* Both ways out are holds, not taps. The map is worth reaching from here —
     a worker checking they have covered the whole plot should not have to
     come all the way back to the list for it — but a pocket must not be able
     to reach it either. */
  const beginHold = (which, done) => (e) => {
    if (e) e.preventDefault();
    startRef.current = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - startRef.current) / HOLD_MS);
      setHold({ which, p });
      if (p >= 1) { stopHold(); done(); return; }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  };

  const target = (which, done, text) => (
    <button
      type="button"
      onPointerDown={beginHold(which, done)}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={text}
      className="relative flex-1 h-14 rounded-2xl border border-slate-800 overflow-hidden"
    >
      <span
        className="absolute inset-y-0 left-0 bg-slate-800"
        style={{ width: `${(hold && hold.which === which ? hold.p : 0) * 100}%` }}
      />
      <span className="relative text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {text}
      </span>
    </button>
  );

  useEffect(() => stopHold, []);

  const running = session && session.status === 'running';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black select-none flex flex-col items-center justify-center gap-8"
      style={{ touchAction: 'none' }}
      /* Every stray touch from a leg ends here and goes no further. */
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* What is being walked, said once, small. */}
      <div className="text-center">
        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700">
          {task ? task.plot : ''}
        </div>
        {/* The one thing worth glancing at, and the biggest patch of lit
            pixels on the screen — so no bigger and no brighter than it has to
            be to read at arm's length in daylight. */}
        <div className="mt-6 text-[36px] leading-none font-black tabular-nums text-slate-500">
          {formatDistance(session ? session.distance : 0)}
        </div>
        <div className="mt-3 text-[15px] font-black tabular-nums text-slate-600">
          {formatDuration(elapsed)}
        </div>
        <div className="mt-2 text-[11px] font-bold tabular-nums text-slate-700">
          {t('wk.trkPointsN', { n: session ? session.points.length : 0 })}
        </div>
      </div>

      {/* The only moving thing on the screen, and the only way to know it is
          alive without waking the phone properly. */}
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${
          running ? 'bg-rose-800 animate-pulse' : 'bg-amber-900'}`} />
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-700">
          {running ? t('wk.pocketRecording') : t('wk.paused')}
        </span>
      </div>

      {/* The two ways out. Big, because they are pressed with a thumb in
          daylight; dim, because they are on screen for an hour. */}
      <div className="mt-2 flex items-stretch gap-3 w-full max-w-[330px] px-6">
        {onMap && target('map', onMap, t('wk.pocketMap'))}
        {target('back', onExit, t('wk.pocketExit'))}
      </div>

      <div className="absolute bottom-6 left-6 right-6 text-center text-[10px] font-bold text-slate-800 leading-relaxed">
        {t('wk.pocketNote')}
      </div>
    </div>
  );
}
