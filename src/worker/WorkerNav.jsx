import { Link } from 'react-router-dom';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';

function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

/*
 * The worker portal's ribbon. The same shape as the FC Portal's TopNav — a
 * back arrow, the title over a tracked-out portal name, the person's name and
 * a way out — so the two portals read as one system in two colours.
 *
 * It is a separate component rather than TopNav with a flag because TopNav
 * signs out of Supabase, and there is no Supabase session to sign out of
 * here. Everything else it does, it does the same way.
 */
export default function WorkerNav({ title, back }) {
  const { t } = useLang();
  const { worker, signOut } = useWorker();

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {back && (
          <Link
            to={back}
            title={t('common.back')}
            aria-label={t('common.back')}
            className="grid place-items-center bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-800 rounded-lg w-9 h-9 transition-colors no-underline shrink-0"
          >
            <BackArrow />
          </Link>
        )}
        <div className="leading-tight min-w-0">
          <div className="font-black text-slate-800 text-sm sm:text-lg truncate">
            {title || 'MJM Nursery'}
          </div>
          <div className="font-black text-emerald-700 text-[10px] uppercase tracking-[0.18em] sm:tracking-[0.25em] leading-none mt-0.5 whitespace-nowrap truncate">
            {t('wk.portal')}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {worker && (
          <span className="hidden sm:inline text-[11px] font-bold text-slate-500 truncate">
            {t('dash.welcome', { name: worker.name })}
          </span>
        )}
        <LangToggle />
        <button
          onClick={signOut}
          title={t('common.signOut')}
          aria-label={t('common.signOut')}
          className="text-[10px] font-bold text-slate-500 hover:text-red-500 bg-slate-50 border-slate-200 uppercase tracking-wider sm:tracking-widest px-2.5 sm:px-3 py-2 rounded-full border cursor-pointer transition-colors shrink-0"
        >
          <span className="hidden sm:inline">{t('common.signOut')}</span>
          <span className="sm:hidden text-[13px] leading-none">⏻</span>
        </button>
      </div>
    </div>
  );
}
