import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MaintenanceModule from '../modules/maintenance/MaintenanceModule.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import {
  makeWorkerMaintSource,
  workerPermissions,
  workerPlotFilter,
} from './workerMaintSource.js';
import WorkerGround from './WorkerGround.jsx';
import WorkerNav from './WorkerNav.jsx';

/*
 * Maintenance, in the Worker Portal — and, since there is no menu in front of
 * it any more, the Worker Portal itself. Signing in lands here.
 *
 * The same module the FC Portal runs — the week card, the month timeline, the
 * ticks against each job, the work sheet. Not a copy of it: literally the same
 * component. A worker and a Field Conductor are doing the same thing when they
 * record a morning's work, and two screens that agree today are two screens
 * that disagree after the next change to one of them.
 *
 * What is different is passed in, not forked:
 *
 *   source       the worker_* database functions rather than the tables, since
 *                a PIN sign-in is `anon` and cannot read those tables
 *   identity     the worker's name, and a permissions object built from their
 *                boundary so the module's own access checks answer correctly
 *   plotFilter   the plot half of a boundary, which a nursery list cannot say
 *   showNursery  off: a worker is allocated to one nursery, so the picker is a
 *                question with one answer. Off it leaves the filter empty
 *                rather than pinned to the first nursery, so a worker whose
 *                boundary spans two still sees both.
 *   (the camera is NOT passed here any more — it is a switch like every other
 *   part of the form, and workerMaintSource forces it off because a PIN
 *   sign-in has no upload path, which is a fact about the door not the view)
 *   nav          the worker's own bar; the FC one signs out of Supabase, and
 *                there is no Supabase session here to sign out of. The cog is
 *                on it because Settings lost its card when the menu went.
 */
export default function WorkerMaintenance() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { token, worker, boundary, actions, company, modules } = useWorker();

  // Rebuilt only when the sign-in changes, so the module is not handed a new
  // data source on every render — it reloads when the source identity moves.
  const source = useMemo(() => makeWorkerMaintSource(token), [token]);
  const permissions = useMemo(
    () => workerPermissions(boundary, actions, company),
    [boundary, actions, company]
  );
  const plotFilter = useMemo(() => workerPlotFilter(boundary), [boundary]);

  return (
    <MaintenanceModule
      source={source}
      identity={{ name: worker ? worker.name : '', permissions }}
      plotFilter={plotFilter}
      showNursery={false}
      nav={
        <>
          <WorkerNav
            book
            title={t('wk.maintTitle')}
            onSettings={modules.settings ? () => navigate('/worker/settings') : null}
          />
          <WorkerGround />
        </>
      }
    />
  );
}
