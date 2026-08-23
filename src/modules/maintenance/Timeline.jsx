import { useLang } from '../../context/LanguageContext.jsx';
import { WORK_TYPES, workTypeLabel } from './helpers.js';
import { WEEKS, weekDates } from './schedule.js';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/**
 * The month, once the week in hand has been dealt with above.
 *
 * This is the "what is coming" view, not the "what do I do now" one, so it is
 * a compact row per week rather than four full-height blocks. Each job is a
 * chip carrying its own colour and its count; a job the schedule does not ask
 * for that week is a dashed outline, so an empty week reads as genuinely
 * empty rather than as something that failed to load.
 *
 * The chips are still tappable — a job done early, or caught up on late, is
 * ordinary.
 */
export default function Timeline({ month, currentWeek, counts, doneCounts, onOpen }) {
  const { t, lang } = useLang();

  return (
    <div className="space-y-2">
      {WEEKS.map((w) => {
        const dates = weekDates(w, month);
        const now = w === currentWeek;
        return (
          <div key={w}
            className={`bg-white rounded-2xl border shadow-[0_4px_16px_rgba(0,0,0,.06)] px-3.5 py-3 ${
              now ? 'border-emerald-500' : 'border-slate-200'}`}>
            <div className="flex items-baseline gap-2 mb-2.5">
              <span className="text-[13px] font-black text-slate-700">{t('mt.weekN', { n: w })}</span>
              <span className="text-[12px] font-bold text-slate-400">{dates}</span>
              {now && (
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-600">
                  {t('mt.thisWeek')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WORK_TYPES.map((wt) => {
                const total = (counts[w] && counts[w][wt.key]) || 0;
                const done  = (doneCounts[w] && doneCounts[w][wt.key]) || 0;
                const left  = Math.max(0, total - done);
                const tint  = tintOf(wt.key);
                const label = workTypeLabel(wt, lang);

                if (!total) {
                  return (
                    <span key={wt.key} title={label}
                      className="inline-flex items-center rounded-full border border-dashed border-slate-200 px-2.5 py-1.5">
                      <WorkIcon workKey={wt.key} className="w-[17px] h-[17px] text-slate-300" />
                    </span>
                  );
                }
                return (
                  <button key={wt.key} type="button" title={label}
                    onClick={() => onOpen(w, wt)}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1.5 ${tint.bg} ${tint.fg}`}>
                    <WorkIcon workKey={wt.key} className="w-[17px] h-[17px]" />
                    <span className="text-[11px] font-black tabular-nums">
                      {left === 0 ? `✓ ${total}` : `${left}/${total}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
