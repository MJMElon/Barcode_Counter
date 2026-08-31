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
 * Two cases survive here, both of them a worker with nothing open at all, and
 * both worth explaining rather than showing an empty list they will read as a
 * broken app: somebody who has just signed up and is waiting to be allocated,
 * and somebody whose Maintenance has been switched off, on their own row or
 * for the whole company.
 */
export default function WorkerHome() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { modules, pending } = useWorker();

  if (modules.maintenance) return <WorkerTasks />;

  /* Signed up, and nobody has filed them under a nursery yet. Worth its own
     screen rather than the "nothing has been opened for you" one: they have
     just this second typed their name in, and "ask your supervisor" reads as
     a refusal when what actually happened is that it worked. */
  if (pending) {
    return (
      <div className="min-h-screen bg-slate-100 fade-enter">
        <WorkerNav title={t('wk.portalSub')} />
        <WorkerGround />
        <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-5 text-center">
            <div className="text-[34px] leading-none mb-3" aria-hidden="true">📋</div>
            <div className="text-[15px] font-black text-slate-800">{t('wk.pendingTitle')}</div>
            <div className="text-[13px] font-semibold text-slate-500 mt-2 leading-relaxed">
              {t('wk.pendingBody')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <WorkerNav
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
