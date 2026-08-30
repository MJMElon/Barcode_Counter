/**
 * A job's completion as the ring around its icon.
 *
 * The percentage is the ring itself rather than a number beside it — four of
 * these in a row are read as a glance at how full each dial is, which is the
 * question ("what is behind?") without anyone doing arithmetic. The track
 * stays visible underneath so an empty ring reads as nothing done rather
 * than as a missing dial.
 *
 * Rotated -90deg so the arc starts at twelve o'clock; a ring that fills from
 * three o'clock looks broken even when the number is right.
 *
 * Lives here rather than inside the dashboard card because the module's own
 * week board draws the same four dials, and two copies of a dial is two
 * chances for the front page and the module to disagree about what full
 * looks like.
 */
export default function ProgressDial({ pct, ringCls, size = 'sm', children }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const box = size === 'lg'
    ? 'w-[68px] h-[68px] sm:w-[84px] sm:h-[84px]'
    : 'w-[58px] h-[58px] sm:w-[68px] sm:h-[68px]';
  return (
    <div className={`relative ${box}`}>
      <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="30" cy="30" r={R} fill="none" strokeWidth="5" className="text-slate-100" stroke="currentColor" />
        <circle
          cx="30" cy="30" r={R} fill="none" strokeWidth="5" strokeLinecap="round"
          className={ringCls} stroke="currentColor"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, Math.max(0, pct)) / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
