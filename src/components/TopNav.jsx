import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';
import { MAIN_PORTAL_URL } from '../config.js';
import { supabase } from '../lib/supabase.js';

// Shared top navigation bar.
// - `title`: heading text
// - `back`: optional route for a Back link (otherwise the brand block shows)
// - `portal`: show a link out to the main MJM portal. Used on the dashboard,
//   which has nowhere to go "back" to inside this app
// - `user`: optional staff name shown top-right, to the left of the language button
// - `theme`: 'light' (default) or 'dark' to match a dark page background
export default function TopNav({ title, subtitle, back, portal, user, theme = 'light' }) {
  const { signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const dark = theme === 'dark';
  const [leaving, setLeaving] = useState(false);

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  /* The portal is a different domain, so the sign-in kept in this one's
     storage does not travel with the link — following it plainly lands on
     the portal's login screen even though the user is signed in here.
     Carry the session across in the URL fragment instead: it is Supabase's
     own implicit-flow shape, the portal already expects it (it skips its
     session-reset when the URL carries a token), and supabase-js strips the
     fragment out of the address bar once it has read it.

     Falls back to a plain link if the session cannot be read, so the button
     always goes somewhere. */
  async function goToPortal(e) {
    if (e) e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    let url = MAIN_PORTAL_URL;
    try {
      const { data } = await supabase.auth.getSession();
      const s = data && data.session;
      if (s && s.access_token && s.refresh_token) {
        url +=
          '#access_token=' + encodeURIComponent(s.access_token) +
          '&refresh_token=' + encodeURIComponent(s.refresh_token) +
          '&expires_in=' + (s.expires_in || 3600) +
          '&token_type=bearer';
      }
    } catch (_) {
      /* keep the plain URL */
    }
    window.location.href = url;
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
        {portal && (
          <a
            href={MAIN_PORTAL_URL}
            onClick={goToPortal}
            className={`${backCls} rounded-full px-3 sm:px-4 py-2 border ${dark ? 'border-[#1f2a38]' : 'border-slate-200'} transition-colors font-bold text-[10px] uppercase tracking-widest whitespace-nowrap no-underline shrink-0 cursor-pointer`}
          >
            <span className="hidden sm:inline">{t('common.moduleSelection')}</span>
            <span className="sm:hidden">{t('common.moduleSelectionShort')}</span>
          </a>
        )}
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
            {/* nowrap: the wide tracking used to break "FC PORTAL" onto two
                lines on a phone, which then collided with the staff name */}
            <div className="font-black text-emerald-600 text-[10px] uppercase tracking-[0.18em] sm:tracking-[0.25em] leading-none mt-0.5 whitespace-nowrap truncate">
              {subtitle}
            </div>
          </div>
        ) : (
          <span className={`font-black ${titleCls} uppercase tracking-wider text-[11px] sm:text-sm truncate`}>{title}</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* The staff name is dropped on phones. It was competing with the
            title for a 360px bar and squeezing it out of view entirely. */}
        {user && (
          <span className={`hidden sm:inline text-[11px] font-bold ${userCls} truncate`}>
            {t('dash.welcome', { name: user })}
          </span>
        )}
        <LangToggle dark={dark} />
        {/* Icon only on phones — the words cost ~55px the title needs more. */}
        <button
          onClick={handleLogout}
          title={t('common.signOut')}
          aria-label={t('common.signOut')}
          className={`text-[10px] font-bold ${signOutCls} uppercase tracking-wider sm:tracking-widest px-2.5 sm:px-3 py-2 rounded-full border cursor-pointer transition-colors shrink-0`}
        >
          <span className="hidden sm:inline">{t('common.signOut')}</span>
          <span className="sm:hidden text-[13px] leading-none">⏻</span>
        </button>
      </div>
    </div>
  );
}
