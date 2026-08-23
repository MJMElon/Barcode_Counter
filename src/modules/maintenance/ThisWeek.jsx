import { useLang } from '../../context/LanguageContext.jsx';
import { WORK_TYPES, workTypeLabel } from './helpers.js';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/**
 * What has to be done this week, and nothing else.
 *
 * A Field Conductor opens this standing in a nursery with a job to start, so
 * the week they are in comes first and gets the whole width. Only the jobs
 * the schedule actually asks for appear — one card if one is due, four if
 * four are. An empty slot for a job nobody has to do is a slot that has to be
 * read and discarded, and there are three of them in a normal week.
 *
 * The big number is what is LEFT, because that is the question being asked.
 */
export default function ThisWeek({ week, dates, counts, doneCounts, onOpen }) {
  const { t, lang } = useLang();

  const due = WORK_TYPES
    .map((wt) => {
      const total = (counts && counts[wt.key]) || 0;
      const done = (doneCounts && doneCounts[wt.key]) || 0;
      return { wt, total, done, left: Math.max(0, total - done) };
    })
    .filter((j) => j.total > 0);

  if (!due.length) {
    return (
      <div className="bg-emerald-50 rounded-3xl px-5 py-6 text-center">
        <div className="text-[14px] font-black text-emerald-700">{t('mt.weekClear')}</div>
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${due.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} sm:grid-cols-4`}>
      {due.map(({ wt, total, done, left }) => {
        const tint = tintOf(wt.key);
        const clear = left === 0;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <button
            key={wt.key}
            type="button"
            onClick={() => onOpen(week, wt)}
            className="relative text-left bg-white rounded-3xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-4 active:scale-[.99] transition-transform"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"
                 className="absolute top-4 right-3.5 w-4 h-4 text-slate-300"
                 fill="none" stroke="currentColor" strokeWidth="2.4"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7" />
            </svg>

            <span className={`w-[52px] h-[52px] rounded-2xl grid place-items-center mb-3 ${tint.bg}`}>
              <WorkIcon workKey={wt.key} className={`w-8 h-8 ${tint.fg}`} />
            </span>

            <div className={`text-[28px] leading-none font-black tabular-nums ${
              clear ? 'text-emerald-600' : tint.fg}`}>
              {clear ? '✓' : left}
            </div>
            <div className="text-[11px] font-bold text-slate-400 mt-1">
              {clear ? t('mt.allPlotsDone', { n: total }) : t('mt.ofPlotsLeft', { n: total })}
            </div>
            <div className="text-[12px] font-black text-slate-600 mt-2 leading-tight">
              {workTypeLabel(wt, lang)}
            </div>

            <div className="mt-2.5 h-[5px] rounded-full bg-slate-100 overflow-hidden">
              <span className={`block h-full rounded-full ${clear ? 'bg-emerald-500' : tint.bar}`}
                    style={{ width: `${clear ? 100 : pct}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
