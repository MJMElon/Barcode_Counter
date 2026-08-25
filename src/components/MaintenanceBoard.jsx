import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { allowedNurseries } from '../lib/access.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import {
  WORK_TYPES,
  loadMaintenanceData,
  loadSchedules,
  nurseryKey,
  pendingRecords,
  todayStr,
  withQueued,
  workTypeLabel,
} from '../modules/maintenance/data.js';
import {
  WEEKS,
  isDone as isJobDone,
  mergeWeekTasks,
  monthLabelOf,
  weekDates,
  weekOfDate,
} from '../modules/maintenance/schedule.js';
import { tintOf } from '../modules/maintenance/tints.js';
import WorkIcon from '../modules/maintenance/WorkIcons.jsx';

const CACHE_KEY = 'maintenance_board_month_v2';

/** One week-stepper arrow. Greys out at the ends of the month instead of
    disappearing, so the control does not change shape as you move. */
function NavArrow({ dir, disabled, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid place-items-center w-7 h-7 rounded-full border shrink-0 transition-colors ${
        disabled
          ? 'border-teal-100 text-teal-200 cursor-default'
          : 'border-teal-300 text-teal-700 hover:bg-teal-100 cursor-pointer'
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir === 'prev' ? <path d="m15 5-7 7 7 7" /> : <path d="m9 5 7 7-7 7" />}
      </svg>
    </button>
  );
}

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
 */
function ProgressDial({ pct, ringCls, children }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative w-[58px] h-[58px] sm:w-[68px] sm:h-[68px]">
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

/**
 * The month's maintenance, on the portal's front page.
 *
 * The Maintenance module already answers "how much of this job is done" — but
 * a week at a time, four weeks down a screen you have to open the module to
 * reach. What a Field Conductor actually wants before deciding where to walk
 * is the one-line version: of everything the office asked for this month, how
 * much of each of the four jobs is behind. So the same sum is rolled up over
 * all four weeks and shown here, beside today's collections.
 *
 * Deliberately the SAME arithmetic as the module's timeline — mergeWeekTasks
 * for what is due, isDone for what is recorded, withQueued so work saved
 * offline still counts. Two screens answering one question must not be able
 * to disagree; anything else and the front page becomes a number nobody
 * trusts.
 *
 * Reads once on mount and caches, like the collection board: a month's totals
 * do not move minute to minute, and this is the heavier of the two reads.
 */
export default function MaintenanceBoard() {
  const { permissions } = useAuth();
  const { t, lang } = useLang();

  const month = monthLabelOf(todayStr());

  // Last month's totals under this month's heading would be a lie, so a cache
  // from a month that has turned over is dropped rather than shown.
  const cached = cacheGet(CACHE_KEY);
  const fresh = cached && cached.value && cached.value.month === month ? cached : null;
  // { totals: {key:n}, done: {key:n}, month, scheduled }
  const [sum, setSum] = useState(fresh?.value || null);
  const [updatedAt, setUpdatedAt] = useState(fresh?.at || null);
  const [failed, setFailed] = useState(false);
  // A restricted user must be summed over their own nurseries only, exactly
  // as the module scopes them — otherwise the front page quotes a total for
  // plots they are not allowed to see.
  // Opens on the week you are actually in; stepping is per-visit, not saved.
  const [week, setWeek] = useState(() => weekOfDate(todayStr()) || 1);

  const allowed = allowedNurseries(permissions, 'maintenance');
  const allowedSig = allowed === null ? '*' : [...allowed].sort().join('|');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ plots, records }, queued] = await Promise.all([
          loadMaintenanceData(),
          pendingRecords().catch(() => []),
        ]);
        const nurseries = [
          ...new Set(
            plots
              .filter((p) => allowed === null || allowed.includes(p.nursery_name))
              .map((p) => p.nursery_name)
              .filter(Boolean)
          ),
        ];
        if (!nurseries.length) {
          if (live) setSum({ totals: {}, done: {}, month, scheduled: false });
          return;
        }
        // The office files under BNN / UNN1; shared_plots says "UNN 1". Ask
        // for both spellings and keep whichever comes back.
        const keys = [...new Set(nurseries.flatMap((n) => [n, nurseryKey(n)]))];
        const schedule = await loadSchedules(keys, month);
        const all = withQueued(records, queued);

        // Kept week by week rather than summed. The board shows one week at
        // a time and you step between them, so a month-wide total would have
        // to be un-summed again to answer "what is due now".
        const byWeek = {};
        WEEKS.forEach((w) => {
          const tasks = mergeWeekTasks(schedule, w);
          const totals = {};
          const done = {};
          WORK_TYPES.forEach((wt) => {
            const list = tasks[wt.key] || [];
            totals[wt.key] = list.length;
            done[wt.key] = list.filter((x) =>
              isJobDone(all, {
                workTypeKey: wt.key, plot: x.plot, chemical: x.chemical, week: w, month,
              })
            ).length;
          });
          byWeek[w] = { totals, done };
        });

        const next = { byWeek, month, scheduled: schedule.length > 0 };
        if (!live) return;
        setSum(next);
        setUpdatedAt(Date.now());
        setFailed(false);
        cacheSet(CACHE_KEY, next);
      } catch (e) {
        // Offline, or the tables are not set up on this project yet. Whatever
        // was cached stays on screen; a portal that cannot reach the office
        // must still show the modules below.
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [allowedSig, month]);

  // A month the office has not planned yet, or one with nothing due, has
  // nothing to report — and an empty widget is worse than no widget. Keep it
  // out of the way until there is a number to show.
  const anyWork = useMemo(
    () =>
      !!sum &&
      WEEKS.some((w) =>
        WORK_TYPES.some((wt) => ((sum.byWeek?.[w]?.totals || {})[wt.key] || 0) > 0)
      ),
    [sum]
  );
  if (sum && !anyWork) return null;

  const thisWeek = weekOfDate(todayStr());
  const wk = (sum && sum.byWeek && sum.byWeek[week]) || { totals: {}, done: {} };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-4 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-teal-50">
        <div className="flex items-center justify-between gap-2">
          <span className="font-black uppercase tracking-widest text-[11px] sm:text-xs text-teal-800 truncate">
            🛠️ {t('mtb.title')}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-black text-teal-700">{month}</span>
            {/* The programme schedule. Points at the Maintenance module, which
                is where the month's plan actually lives today — repoint it at
                a schedule view here once there is one. */}
            <Link
              to="/maintenance"
              title={t('mtb.schedule')}
              aria-label={t('mtb.schedule')}
              className="grid place-items-center w-6 h-6 rounded-full border border-teal-300 text-teal-700 text-[11px] font-black italic no-underline hover:bg-teal-100 transition-colors"
            >
              i
            </Link>
          </div>
        </div>

        {/* Which week. The arrows stop at the ends rather than wrapping —
            week 4 rolling round to week 1 reads as the month having changed. */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <NavArrow
            dir="prev"
            disabled={week <= WEEKS[0]}
            onClick={() => setWeek((w) => Math.max(WEEKS[0], w - 1))}
            label={t('mtb.prevWeek')}
          />
          <div className="text-center leading-tight min-w-0">
            <div className="text-[12px] font-black text-teal-800 uppercase tracking-wide">
              {t('mt.weekN', { n: week })}
              {week === thisWeek && <span className="text-teal-600"> · {t('mt.thisWeek')}</span>}
            </div>
            <div className="text-[10px] font-bold text-teal-600">{weekDates(week, month)}</div>
          </div>
          <NavArrow
            dir="next"
            disabled={week >= WEEKS[WEEKS.length - 1]}
            onClick={() => setWeek((w) => Math.min(WEEKS[WEEKS.length - 1], w + 1))}
            label={t('mtb.nextWeek')}
          />
        </div>
      </div>

      {!sum ? (
        <div className="px-4 py-5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {failed ? t('mtb.unavailable') : t('common.loading')}
        </div>
      ) : (
        <>
          {/* All four jobs on one row. Four dials fit a 360px phone at ~78px
              a column, which keeps the ring readable and the whole board
              shorter than the stack of bars it replaced. */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3 p-3">
            {WORK_TYPES.map((wt) => {
              const total = wk.totals[wt.key] || 0;
              const doneN = wk.done[wt.key] || 0;
              const pct = total ? Math.round((doneN / total) * 100) : 0;
              const clear = total > 0 && doneN >= total;
              const tint = tintOf(wt.key);
              return (
                <div key={wt.key} className={`flex flex-col items-center ${total ? '' : 'opacity-50'}`}>
                  <ProgressDial
                    pct={pct}
                    ringCls={clear ? 'text-emerald-500' : total ? tint.ring : 'text-slate-200'}
                  >
                    <WorkIcon
                      workKey={wt.key}
                      className={`w-[26px] h-[26px] sm:w-8 sm:h-8 ${total ? tint.fg : 'text-slate-300'}`}
                    />
                  </ProgressDial>

                  {/* Two lines reserved for the name so all four columns line
                      their numbers up, and clamped there so the Malay names —
                      "Penyemburan Racun Kulat & Serangga" — cannot push one
                      column taller than the rest. */}
                  <span className="mt-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-slate-500 leading-[1.2] text-center line-clamp-2 min-h-[22px]">
                    {workTypeLabel(wt, lang)}
                  </span>

                  <span className="text-[10px] sm:text-[11px] font-black tabular-nums leading-none text-slate-400">
                    {total ? (
                      <>
                        <span className={clear ? 'text-emerald-600' : 'text-slate-700'}>
                          {clear ? '✓' : doneN}
                        </span>
                        {!clear && `/${total}`}
                      </>
                    ) : (
                      t('mtb.none')
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <Link to="/maintenance"
            className="px-4 py-1.5 border-t border-slate-100 text-[9px] font-bold text-slate-400 flex justify-between gap-3 no-underline hover:text-teal-700">
            <span className="truncate">{t('mtb.footer')}</span>
            <span className="shrink-0">
              {failed
                ? t('mtb.cached')
                : updatedAt
                ? t('board.updated', { time: new Date(updatedAt).toLocaleTimeString() })
                : ''}
            </span>
          </Link>
        </>
      )}
    </div>
  );
}
