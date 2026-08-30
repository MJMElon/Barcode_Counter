import { useLang } from '../../context/LanguageContext.jsx';
import { weekDates } from './schedule.js';

/**
 * Which week is on screen, and how to get to another one.
 *
 * This replaced a block fixed to the week we happen to be standing in. That
 * block answered "what do I do now" and nothing else — but a Field Conductor
 * at a tablet is as often catching up on last week or reading ahead to next,
 * and neither was reachable without scrolling the month and guessing which
 * chip belonged to which week.
 *
 * Back and next walk the month and then walk off it: back from week 1 is the
 * previous month's week 4, and the schedule for that month is read the same
 * way this month's is. "Now" is offered only when it would change something,
 * so the row does not carry a button that does nothing four weeks out of five.
 */
export default function WeekNav({ month, week, isNow, onPrev, onNext, onNow }) {
  const { t } = useLang();
  const arrow = 'w-10 h-10 rounded-xl grid place-items-center bg-white border border-slate-200 '
              + 'text-slate-500 hover:text-slate-800 hover:border-slate-300 active:scale-95 transition shrink-0';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrev} className={arrow} aria-label={t('mt.lastWeek')}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px]"
             fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>

      <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl px-3.5 py-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[14px] font-black text-slate-800 truncate">
            {t('mt.weekN', { n: week })}
          </span>
          {isNow && (
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 shrink-0">
              {t('mt.thisWeek')}
            </span>
          )}
        </div>
        <div className="text-[11px] font-bold text-slate-400 truncate">
          {[weekDates(week, month), month].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Only when it goes somewhere. A dead "Now" on the week you are already
          in is a button that has to be read and discarded. */}
      {!isNow && (
        <button type="button" onClick={onNow}
          className="shrink-0 h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white
                     font-black text-[10px] uppercase tracking-widest active:scale-95 transition">
          {t('mt.now')}
        </button>
      )}

      <button type="button" onClick={onNext} className={arrow} aria-label={t('mt.nextWeek')}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px]"
             fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
