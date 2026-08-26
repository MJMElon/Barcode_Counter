import { useMemo } from 'react';
import MaintenanceModule from '../modules/maintenance/MaintenanceModule.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import {
  makeWorkerMaintSource,
  workerPermissions,
  workerPlotFilter,
} from './workerMaintSource.js';
import WorkerNav from './WorkerNav.jsx';

/*
 * Maintenance, in the Worker Portal.
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
 *   allowPhotos  off — there is no upload path for anon
 *   nav          the worker's own bar; the FC one signs out of Supabase, and
 *                there is no Supabase session here to sign out of
 */
export default function WorkerMaintenance() {
  const { t } = useLang();
  const { token, worker, boundary } = useWorker();

  // Rebuilt only when the sign-in changes, so the module is not handed a new
  // data source on every render — it reloads when the source identity moves.
  const source = useMemo(() => makeWorkerMaintSource(token), [token]);
  const permissions = useMemo(() => workerPermissions(boundary), [boundary]);
  const plotFilter = useMemo(() => workerPlotFilter(boundary), [boundary]);

  return (
    <MaintenanceModule
      source={source}
      identity={{ name: worker ? worker.name : '', permissions }}
      plotFilter={plotFilter}
      allowPhotos={false}
      nav={<WorkerNav title={t('wk.maintTitle')} back="/worker" />}
    />
  );
}
