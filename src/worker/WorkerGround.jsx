import { useLang } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import { describeBoundary } from './workerApi.js';

/*
 * One line under the ribbon: whose phone this is, and the ground they are
 * responsible for.
 *
 * It used to be a card on a menu screen, and the menu is gone — but the line
 * has to survive the menu, because it is the answer to the only question the
 * list below cannot answer for itself. A worker who opens their tasks and
 * finds four plots where they expected nine needs to know that is a setting
 * somebody chose, not the app losing plots.
 *
 * Deliberately one line and no card. This screen is a to-do list; anything
 * above it is standing between a worker and the first job.
 */
export default function WorkerGround() {
  const { t } = useLang();
  const { worker, boundary } = useWorker();

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-1.5 flex items-baseline gap-2 text-[11px] min-w-0">
      <span className="font-black text-slate-700 truncate shrink-0 max-w-[45%]">
        {worker ? worker.name : ''}
      </span>
      <span className="text-slate-300 shrink-0" aria-hidden="true">·</span>
      <span className="font-black text-emerald-700/60 uppercase tracking-[0.14em] shrink-0">
        {t('wk.boundary')}
      </span>
      <span className="font-bold text-slate-500 truncate">
        {describeBoundary(boundary, t)}
      </span>
    </div>
  );
}
