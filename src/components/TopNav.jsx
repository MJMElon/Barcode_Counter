import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';

// Shared top navigation bar.
// - `title`: heading text
// - `back`: optional route for a Back link (otherwise the brand block shows)
// - `user`: optional staff name shown top-right, to the left of the language button
// - `settingsTo`: optional route for a settings gear icon (admin only)
// - `theme`: 'light' (default) or 'dark' to match a dark page background
export default function TopNav({ title, subtitle, back, user, settingsTo, theme = 'light' }) {
  const { signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  const bar = dark
    ? 'bg-[#0f1620] border-[#1f2a38]'
    : 'bg-white border-slate-200';
  const titleCls = dark ? 'text-slate-100' : 'text-slate-800';
  const backCls = dark
    ? 'bg-[#111821] border border-[#1f2a38] text-slate-300 hover:text-emerald-400'
    : 'bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700';
  const userCls = dark ? 'text-slate-400' : 'text-slate-500';
  const signOutCls = dark
    ? 'text-slate-400 hover:text-red-400 bg-[#111821] border-[#1f2a38]'
    : 'text-slate-500 hover:text-red-500 bg-slate-50 border-slate-200';

  return (
    <div className={`${bar} border-b px-3 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-30 shadow-sm`}>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {back && (
          <Link
            to={back}
            className={`flex items-center gap-1 ${backCls} rounded-lg px-2.5 py-2 transition-colors font-black text-xs uppercase tracking-wider whitespace-nowrap no-underline shrink-0`}
          >
            {t('common.back')}
          </Link>
        )}
        {subtitle ? (
          <div className="leading-tight min-w-0">
            <div className={`font-black ${titleCls} text-sm sm:text-lg truncate`}>{title}</div>
            <div className="font-black text-emerald-600 text-[10px] uppercase tracking-[0.25em] leading-none mt-0.5">{subtitle}</div>
          </div>
        ) : (
          <span className={`font-black ${titleCls} uppercase tracking-wider text-[11px] sm:text-sm truncate`}>{title}</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user && (
          <span className={`text-[11px] font-bold ${userCls} max-w-[84px] sm:max-w-none truncate`}>
            <span className="hidden sm:inline">{t('dash.welcome', { name: user })}</span>
            <span className="sm:hidden">{user}</span>
          </span>
        )}
        {settingsTo && (
          <Link
            to={settingsTo}
            title="Nursery Access Settings"
            className={`text-[10px] font-bold ${signOutCls} uppercase tracking-widest px-3 py-2 rounded-full border cursor-pointer transition-colors shrink-0 no-underline`}
          >
            ⚙
          </Link>
        )}
        <LangToggle dark={dark} />
        <button
          onClick={handleLogout}
          className={`text-[10px] font-bold ${signOutCls} uppercase tracking-widest px-3 py-2 rounded-full border cursor-pointer transition-colors shrink-0`}
        >
          {t('common.signOut')}
        </button>
      </div>
    </div>
  );
}
