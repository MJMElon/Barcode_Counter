import { useLang } from '../../context/LanguageContext.jsx';
import { WORK_TYPES, workTypeLabel } from './helpers.js';
import { WEEKS, weekDates } from './schedule.js';
import WorkIcon from './WorkIcons.jsx';

/**
 * The month as four blocks of seven days, each showing the four jobs.
 *
 * A Field Conductor's month is planned in those blocks, so the module opens on
 * them rather than on a list of past records. Each icon carries how many plots
 * are still to do; tapping it opens the sheet that records the work.
 */
export default function Timeline({ month, currentWeek, counts, doneCounts, onOpen }) {
  const { t, lang } = useLang();

  return (
    <div className="space-y-3">
      {WEEKS.map((w) => {
        const dates = weekDates(w, month);
        const now = w === currentWeek;
        return (
          <div key={w}
            className={`bg-white rounded-2xl border shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden ${
              now ? 'border-emerald-500' : 'border-slate-200'}`}>
            <div className={`px-4 py-2.5 flex items-baseline gap-2 ${now ? 'bg-emerald-50' : 'bg-slate-50'}`}>
              <span className={`text-[13px] font-black uppercase tracking-wide ${
                now ? 'text-emerald-700' : 'text-slate-700'}`}>
                {t('mt.weekN', { n: w })}
              </span>
              <span className="text-[12px] font-bold text-slate-500">({dates})</span>
              {now && (
                <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-600">
                  {t('mt.thisWeek')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 divide-x divide-slate-100">
              {WORK_TYPES.map((wt) => {
                const total = (counts[w] && counts[w][wt.key]) || 0;
                const done  = (doneCounts[w] && doneCounts[w][wt.key]) || 0;
                const left  = Math.max(0, total - done);
                const idle  = total === 0;
                return (
                  <button key={wt.key}
                    disabled={idle}
                    onClick={() => onOpen(w, wt)}
                    title={workTypeLabel(wt, lang)}
                    className={`relative flex flex-col items-center gap-1 py-3 px-1 transition-colors ${
                      idle ? 'opacity-30 cursor-default' : 'hover:bg-slate-50 active:bg-slate-100'}`}>
                    <WorkIcon workKey={wt.key} className="w-7 h-7 text-slate-700" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 text-center leading-tight">
                      {workTypeLabel(wt, lang)}
                    </span>
                    {/* Plots still to do — a green tick once the week's list is
                        cleared, so a glance is enough. */}
                    {total > 0 && (
                      <span className={`text-[10px] font-black px-1.5 rounded-full ${
                        left === 0 ? 'text-emerald-700 bg-emerald-100' : 'text-amber-800 bg-amber-100'}`}>
                        {left === 0 ? `✓ ${total}` : `${left}/${total}`}
                      </span>
                    )}
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
