import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { BOOK_COVER_CSS, COVER_BLUE } from './bookCover.js';

// Login / Sign-up / Forgot-password / Recovery screen, on the shared Supabase
// project — the same accounts as ai.mjmnursery.com.
//
// Dressed as the cover of the 555 exercise book everyone in the nursery
// already writes in: the red logotype across the top, a lot of blank cover,
// and "Name……………" ruled near the foot — which is where you sign in.
//
// The Auditor Portal wears the same cover in pink. Only the colour differs,
// exactly like the books themselves.
//
// Nothing on this screen but signing in — no language toggle, no controls.
// Everything the app does appears once you are through the door; the
// toggle lives in TopNav, on every screen behind it.
export default function AuthScreen() {
  const { recovering, setRecovering, allowed } = useAuth();
  const { t } = useLang();
  const [mode, setMode] = useState('login'); // login | signup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'error'|'ok', text }

  const note = (kind, text) => setMsg({ kind, text });

  async function handleMain() {
    if (!email || !password) return note('error', t('auth.enterEmailPw'));
    setBusy(true);
    setMsg(null);
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) note('error', t('auth.signupErr', { msg: error.message }));
      else {
        note('ok', t('auth.accountCreated'));
        setMode('login');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) note('error', t('auth.loginErr', { msg: error.message }));
      // On success the AuthContext listener flips the view.
    }
    setBusy(false);
  }

  async function handleForgot() {
    if (!email) return note('error', t('auth.enterEmailFirst'));
    setBusy(true);
    // Pin the reset link to THIS app. Without an explicit redirectTo,
    // Supabase falls back to the project-wide Site URL (a different MJM app).
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/',
    });
    note(error ? 'error' : 'ok', error ? error.message : t('auth.resetSent'));
    setBusy(false);
  }

  async function handleUpdatePassword() {
    if (!newPassword || newPassword.length < 6) return note('error', t('auth.pwTooShort'));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) note('error', error.message);
    else {
      note('ok', t('auth.pwUpdated'));
      setRecovering(false);
      window.location.hash = '';
    }
    setBusy(false);
  }

  return (
    <div className="bk-page" style={COVER_BLUE}>

      <div className="bk-book">
        {/* the inside pages, showing past the cover */}
        <div className="bk-edges" aria-hidden="true"><i /><i /><i /></div>

        <div className="bk-cover">
          <div className="bk-smudge" aria-hidden="true" />

          {/* The cover reads top to bottom: who it belongs to, the book, the
              portal it opens. 555 is the hero — the rest is small print. */}
          <div className="bk-brand">MJM Nursery</div>
          <div className="bk-logo-wrap">
            <div className="bk-logo">555</div>
          </div>
          <div className="bk-portal">{t('auth.portal')}</div>

          <div className="bk-lines">
            {allowed === false && <div className="bk-note bk-warn">{t('auth.noAccess')}</div>}
            {msg && (
              <div className={`bk-note ${msg.kind === 'error' ? 'bk-err' : 'bk-ok'}`}>
                {msg.text}
              </div>
            )}

            {recovering ? (
              <>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('auth.newPasswordTitle')}
                  className="bk-field"
                />
                <button onClick={handleUpdatePassword} disabled={busy} className="bk-btn">
                  {busy ? t('auth.updating') : t('auth.savePassword')}
                </button>
              </>
            ) : (
              <>
                {mode === 'signup' && (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.fullName')}
                    className="bk-field"
                  />
                )}

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder={t('auth.email')}
                  className="bk-field"
                />

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMain()}
                  autoComplete="current-password"
                  placeholder={t('auth.password')}
                  className="bk-field"
                />

                <button onClick={handleMain} disabled={busy} className="bk-btn">
                  {busy ? t('auth.processing') : mode === 'signup' ? t('auth.signup') : t('auth.login')}
                </button>

                <div className="bk-links">
                  {mode === 'login' && (
                    <button onClick={handleForgot} className="bk-link">
                      {t('auth.forgot')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMode(mode === 'login' ? 'signup' : 'login');
                      setMsg(null);
                    }}
                    className="bk-link bk-link-right"
                  >
                    {mode === 'login' ? t('auth.createAccount') : t('auth.backToLogin')}
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <style>{BOOK_COVER_CSS}</style>
    </div>
  );
}
