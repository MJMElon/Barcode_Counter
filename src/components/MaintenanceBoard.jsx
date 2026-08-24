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
} from '../modules/maintenance/schedule.js';
import { tintOf } from '../modules/maintenance/tints.js';
import WorkIcon from '../modules/maintenance/WorkIcons.jsx';

const CACHE_KEY = 'maintenance_board_month';

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
  const allowed = allowedNurseries(permissions);
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

        const totals = {};
        const done = {};
        WORK_TYPES.forEach((wt) => { totals[wt.key] = 0; done[wt.key] = 0; });
        WEEKS.forEach((w) => {
          const tasks = mergeWeekTasks(schedule, w);
          WORK_TYPES.forEach((wt) => {
            const list = tasks[wt.key] || [];
            totals[wt.key] += list.length;
            done[wt.key] += list.filter((x) =>
              isJobDone(all, {
                workTypeKey: wt.key, plot: x.plot, chemical: x.chemical, week: w, month,
              })
            ).length;
          });
        });

        const next = { totals, done, month, scheduled: schedule.length > 0 };
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
    () => !!sum && WORK_TYPES.some((wt) => (sum.totals[wt.key] || 0) > 0),
    [sum]
  );
  if (sum && !anyWork) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-4 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-teal-50">
        <span className="font-black uppercase tracking-widest text-[11px] sm:text-xs text-teal-800 truncate">
          🛠️ {t('mtb.title')}
        </span>
        <span className="text-[10px] font-black text-teal-700 shrink-0">{month}</span>
      </div>

      {!sum ? (
        <div className="px-4 py-5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {failed ? t('mtb.unavailable') : t('common.loading')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-3">
            {WORK_TYPES.map((wt) => {
              const total = (sum.totals[wt.key] || 0);
              const doneN = (sum.done[wt.key] || 0);
              const pct = total ? Math.round((doneN / total) * 100) : 0;
              const clear = total > 0 && doneN >= total;
              const tint = tintOf(wt.key);
              return (
                <div key={wt.key}
                  className={`rounded-xl border px-2.5 py-2 ${
                    total ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                  {/* Two lines reserved for the name so all four tiles line
                      their numbers up, and clamped there so the Malay names —
                      "Penyemburan Racun Kulat & Serangga" — cannot push one
                      tile taller than the rest. */}
                  <div className="flex items-start gap-1.5 min-w-0 min-h-[26px]">
                    <WorkIcon workKey={wt.key}
                      className={`w-[18px] h-[18px] shrink-0 ${total ? tint.fg : 'text-slate-300'}`} />
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 leading-[1.25] line-clamp-2">
                      {workTypeLabel(wt, lang)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-[17px] font-black tabular-nums leading-none ${
                      clear ? 'text-emerald-600' : total ? 'text-slate-800' : 'text-slate-300'}`}>
                      {clear ? '✓' : doneN}
                    </span>
                    {!clear && (
                      <span className="text-[12px] font-black text-slate-400 tabular-nums leading-none">
                        /{total}
                      </span>
                    )}
                    <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-400">
                      {total ? t('mtb.donePct', { pct }) : t('mtb.none')}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${clear ? 'bg-emerald-500' : tint.bar}`}
                      style={{ width: `${pct}%` }} />
                  </div>
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
