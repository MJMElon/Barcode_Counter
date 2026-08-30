import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';
import { MAIN_PORTAL_URL } from '../config.js';
import { supabase } from '../lib/supabase.js';

// A plain left arrow. Every "go back" control in the app is just this — the
// destination is obvious from context, so the words were only taking room.
function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

// A cog. Settings is a place you visit rarely and leave again, so it sits in
// the bar beside the staff name rather than taking a slot in the tab row.
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

// Shared top navigation bar.
// - `title`: heading text
// - `back`: optional route for a Back link (otherwise the brand block shows)
// - `portal`: show a link out to the main MJM portal. Used on the dashboard,
//   which has nowhere to go "back" to inside this app
// - `user`: optional staff name shown top-right, to the left of the language button
// - `onSettings`: show a cog beside the staff name; `settingsOn` marks it as
//   the page currently open
// - `theme`: 'light' (default) or 'dark' to match a dark page background
// - `book`: stack the title the way the 555 book cover on the login screen
//   reads — house name, 555, then the portal. Dashboard only
export default function TopNav({
  title,
  subtitle,
  back,
  portal,
  user,
  onSettings,
  settingsOn,
  theme = 'light',
  book,
}) {
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

  /* The 555 mark, stacked: the book on top and biggest, the house name under
     it, then the portal it opens. Centred as a block on the bar.

     Every line is leading-none with its own small margin rather than relying
     on line-height, because three stacked lines of very different sizes are
     where default leading quietly adds 10px of air and pushes a sticky bar
     down the page. */
  const wordmark = (
    <div className="min-w-0 text-center">
      <div className="font-black italic text-[#065f46] text-[27px] sm:text-[34px] leading-none tracking-tight">
        555
      </div>
      <div className={`font-black ${titleCls} text-[11px] sm:text-[13px] tracking-[0.14em] uppercase leading-none mt-1 whitespace-nowrap`}>
        {title}
      </div>
      {/* nowrap: the wide tracking used to break "FC PORTAL" onto two lines
          on a phone, which then collided with the staff name */}
      <div className="font-black text-emerald-600 text-[9px] sm:text-[10px] uppercase tracking-[0.18em] sm:tracking-[0.25em] leading-none mt-1 whitespace-nowrap">
        {subtitle}
      </div>
    </div>
  );

  const leftControls = (
    <>
      {portal && (
        <a
          href={MAIN_PORTAL_URL}
          onClick={goToPortal}
          title={t('common.moduleSelection')}
          aria-label={t('common.moduleSelection')}
          className={`${backCls} grid place-items-center rounded-full w-9 h-9 border ${dark ? 'border-[#1f2a38]' : 'border-slate-200'} transition-colors no-underline shrink-0 cursor-pointer`}
        >
          <BackArrow />
        </a>
      )}
      {back && (
        <Link
          to={back}
          title={t('common.back')}
          aria-label={t('common.back')}
          className={`grid place-items-center ${backCls} rounded-lg w-9 h-9 transition-colors no-underline shrink-0`}
        >
          <BackArrow />
        </Link>
      )}
    </>
  );

  const rightControls = (
    <>
      {/* The staff name is dropped on phones. It was competing with the
          title for a 360px bar and squeezing it out of view entirely. */}
      {user && (
        <span className={`hidden sm:inline text-[11px] font-bold ${userCls} truncate`}>
          {t('dash.welcome', { name: user })}
        </span>
      )}
      {onSettings && (
        <button
          onClick={onSettings}
          title={t('set.title')}
          aria-label={t('set.title')}
          className={`grid place-items-center rounded-full w-9 h-9 border transition-colors cursor-pointer shrink-0 ${
            settingsOn
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : `${backCls} ${dark ? 'border-[#1f2a38]' : 'border-slate-200'}`
          }`}
        >
          <CogIcon />
        </button>
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
    </>
  );

  /* Two layouts. `book` centres the wordmark with a three-column grid; every
     other page keeps the plain row, because the page name belongs beside the
     back arrow you came in through, not floating in the middle.

     The side columns are `auto`, not `1fr`. Equal flexible columns put the
     mark on the bar's exact centre line, which is prettier — and on a 390px
     phone it forced the empty left column to match the width of the controls
     on the right, pushing Sign Out six pixels off the screen. `auto` gives
     each side what it needs and centres the mark in what is left, so the mark
     still reads as centred whenever the two sides are anywhere near equal,
     and the bar cannot overflow when they are not. */
  if (book) {
    return (
      <div
        className={`${bar} border-b px-3 sm:px-6 py-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sticky top-0 z-30 shadow-sm`}
      >
        <div className="flex items-center gap-2 sm:gap-3 justify-self-start">{leftControls}</div>
        <div className="justify-self-center min-w-0">{wordmark}</div>
        <div className="flex items-center gap-2 sm:gap-3 justify-self-end">{rightControls}</div>
      </div>
    );
  }

  return (
    <div className={`${bar} border-b px-3 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-30 shadow-sm`}>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {leftControls}
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

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">{rightControls}</div>
    </div>
  );
}
