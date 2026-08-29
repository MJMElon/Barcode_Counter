import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import WorkerGround from './WorkerGround.jsx';
import WorkerTasks from './WorkerTasks.jsx';
import WorkerNav from './WorkerNav.jsx';

/*
 * What a worker lands on after signing in.
 *
 * There is no menu any more. A worker signing in has one thing to do — the
 * jobs the office has scheduled for the ground they are on — and a page of
 * cards asking which of one thing they wanted was a tap that never told
 * anybody anything. Signing in opens the to-do list.
 *
 * Settings, for the one or two workers who have it, moved to the cog in the
 * ribbon. It is a place you visit rarely and leave again, which is exactly
 * what the cog is for on the FC Portal's own bar.
 *
 * The card screen survives here only for the case where a worker has nothing
 * open at all — somebody whose Maintenance has been switched off, on their own
 * row or for the whole company. That is rare and it is worth explaining
 * rather than showing an empty list they will read as a broken app.
 */
export default function WorkerHome() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { modules } = useWorker();

  if (modules.maintenance) return <WorkerTasks />;

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <WorkerNav
        book
        title={t('wk.portalSub')}
        onSettings={modules.settings ? () => navigate('/worker/settings') : null}
      />
      <WorkerGround />

      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] font-semibold text-amber-900">
          {t('wk.nothingOpen')}
        </div>
      </div>
    </div>
  );
}
