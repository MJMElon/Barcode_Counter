import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';

// Login / Sign-up / Forgot-password / Recovery screen. Ported from the Mobile
// app's auth UI, using the shared Supabase project.
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#050a0e]">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%,#0a1a12 0%,#050a0e 70%)' }} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,.04)1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,.04)1px,transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="absolute top-4 right-4 z-20">
        <LangToggle dark />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-[2.5rem] p-10 border border-emerald-400/20 bg-[rgba(5,20,12,.88)] backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="text-center" style={{ fontSize: 'clamp(2.2rem,6vw,3.2rem)', lineHeight: 1.1, fontWeight: 900, color: '#ecfdf5' }}>
            MJM
            <span className="block text-emerald-400 font-black" style={{ fontSize: '0.55em', letterSpacing: '0.3em', marginTop: 2 }}>
              NURSERY
            </span>
          </div>
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-[10px] mt-3 text-white font-black tracking-[0.12em] border border-emerald-400" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            AI
          </div>
          <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.35em] mt-5 text-center">{t('auth.portal')}</p>
        </div>

        {allowed === false && (
          <div className="mb-4 text-[11px] font-bold text-amber-300 bg-amber-900/30 border border-amber-500/40 rounded-xl px-4 py-3 text-center">
            {t('auth.noAccess')}
          </div>
        )}

        {msg && (
          <div
            className={`mb-4 text-[11px] font-bold rounded-xl px-4 py-3 text-center border ${
              msg.kind === 'error'
                ? 'text-red-300 bg-red-900/30 border-red-500/40'
                : 'text-emerald-300 bg-emerald-900/30 border-emerald-500/40'
            }`}
          >
            {msg.text}
          </div>
        )}

        {recovering ? (
          <div className="space-y-3">
            <div className="text-center text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">
              {t('auth.newPasswordTitle')}
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('auth.newPasswordPlaceholder')}
              className="auth-input"
            />
            <button onClick={handleUpdatePassword} disabled={busy} className="auth-btn">
              {busy ? t('auth.updating') : t('auth.savePassword')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mode === 'signup' && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.fullName')}
                className="auth-input"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email')}
              className="auth-input"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMain()}
              placeholder={t('auth.password')}
              className="auth-input"
            />
            <button onClick={handleMain} disabled={busy} className="auth-btn mt-1">
              {busy ? t('auth.processing') : mode === 'signup' ? t('auth.signup') : t('auth.login')}
            </button>
            <div className="flex justify-between items-center pt-2">
              {mode === 'login' && (
                <button
                  onClick={handleForgot}
                  className="text-[10px] font-bold text-emerald-600/70 hover:text-emerald-400 uppercase tracking-widest bg-transparent border-none cursor-pointer"
                >
                  {t('auth.forgot')}
                </button>
              )}
              <button
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setMsg(null);
                }}
                className="text-[10px] font-bold text-slate-400 hover:text-emerald-400 uppercase tracking-widest bg-transparent border-none cursor-pointer ml-auto"
              >
                {mode === 'login' ? t('auth.createAccount') : t('auth.backToLogin')}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .auth-input{background:rgba(255,255,255,.05);border:1px solid rgba(52,211,153,.2);color:#ecfdf5;border-radius:14px;padding:14px 18px;width:100%;font-size:14px;font-weight:600;outline:none;transition:all .2s;}
        .auth-input::placeholder{color:rgba(167,243,208,.4);}
        .auth-input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.15);background:rgba(255,255,255,.08);}
        .auth-btn{width:100%;padding:14px;background:linear-gradient(135deg,#059669,#10b981);color:white;font-weight:900;font-size:12px;letter-spacing:.15em;text-transform:uppercase;border:none;border-radius:14px;cursor:pointer;box-shadow:0 8px 20px rgba(16,185,129,.35);transition:all .2s;}
        .auth-btn:hover{transform:translateY(-1px);}
        .auth-btn:disabled{opacity:.6;cursor:default;transform:none;}
      `}</style>
    </div>
  );
}
