import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';

// Shared top navigation bar. `back` (when provided) shows a "Back" link to the
// given route; otherwise the brand block is shown.
export default function TopNav({ title, back }) {
  const { signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        {back ? (
          <Link
            to={back}
            className="flex items-center gap-2 bg-slate-100 hover:bg-emerald-100 rounded-lg px-3 py-2 text-slate-500 hover:text-emerald-700 transition-colors font-black text-xs uppercase tracking-wider whitespace-nowrap no-underline"
          >
            {t('common.back')}
          </Link>
        ) : (
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0">
            AI
          </div>
        )}
        <span className="font-black text-slate-800 uppercase tracking-widest text-xs sm:text-sm truncate">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <LangToggle />
        <button
          onClick={handleLogout}
          className="text-[10px] font-bold text-slate-500 hover:text-red-500 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-200 cursor-pointer transition-colors"
        >
          {t('common.signOut')}
        </button>
      </div>
    </div>
  );
}
