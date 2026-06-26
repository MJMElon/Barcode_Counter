import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';
import { useOnline } from '../hooks/useOnline.js';

// Shared top navigation bar.
// - `title`: heading text
// - `back`: optional route for a Back link (otherwise the brand block shows)
// - `user`: optional staff name shown top-right, to the left of the language button
export default function TopNav({ title, back, user }) {
  const { signOut } = useAuth();
  const { t } = useLang();
  const online = useOnline();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {back ? (
          <Link
            to={back}
            className="flex items-center gap-1 bg-slate-100 hover:bg-emerald-100 rounded-lg px-2.5 py-2 text-slate-500 hover:text-emerald-700 transition-colors font-black text-xs uppercase tracking-wider whitespace-nowrap no-underline shrink-0"
          >
            {t('common.back')}
          </Link>
        ) : (
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0">
            AI
          </div>
        )}
        <span className="font-black text-slate-800 uppercase tracking-wider text-[11px] sm:text-sm truncate">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user && (
          <span className="text-[11px] font-bold text-slate-500 max-w-[84px] sm:max-w-none truncate">
            <span className="hidden sm:inline">{t('dash.welcome', { name: user })}</span>
            <span className="sm:hidden">{user}</span>
          </span>
        )}
        <LangToggle />
        <span
          title={online ? t('nav.online') : t('nav.offline')}
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        <button
          onClick={handleLogout}
          className="text-[10px] font-bold text-slate-500 hover:text-red-500 uppercase tracking-widest bg-slate-50 px-3 py-2 rounded-full border border-slate-200 cursor-pointer transition-colors shrink-0"
        >
          {t('common.signOut')}
        </button>
      </div>
    </div>
  );
}
