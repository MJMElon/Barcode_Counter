import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';

// Login / Sign-up / Forgot-password / Recovery screen, on the shared Supabase
// project — the same accounts as ai.mjmnursery.com.
//
// Dressed as the field book the FC crew already carries: kraft cover, spiral
// along the top, graph paper inside. The Audit portal is a 555 red-cover
// exercise book instead, so the two login pages are never mistaken for each
// other on a phone held at arm's length in the sun.
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
    <div className="fc-desk">
      <div className="fc-lang">
        <LangToggle dark />
      </div>

      <div className="fc-book">
        {/* spiral along the top edge */}
        <div className="fc-rings" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => <i key={i} />)}
        </div>

        {/* kraft cover flap */}
        <div className="fc-cover">
          <div className="fc-holes" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => <i key={i} />)}
          </div>
          <div className="fc-cover-in">
            <div>
              <div className="fc-brand">MJM Nursery</div>
              <div className="fc-title">FC Field Book</div>
              <div className="fc-sub">{t('auth.portal')}</div>
            </div>
            <div className="fc-555">
              <b>555</b>
              <i>No. ___</i>
            </div>
          </div>
        </div>

        {/* graph paper */}
        <div className="fc-page">
          {allowed === false && (
            <div className="fc-note fc-note-warn">{t('auth.noAccess')}</div>
          )}

          {msg && (
            <div className={`fc-note ${msg.kind === 'error' ? 'fc-note-err' : 'fc-note-ok'}`}>
              {msg.text}
            </div>
          )}

          {recovering ? (
            <>
              <label className="fc-label">{t('auth.newPasswordTitle')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="fc-input"
              />
              <button onClick={handleUpdatePassword} disabled={busy} className="fc-btn">
                {busy ? t('auth.updating') : t('auth.savePassword')}
              </button>
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <>
                  <label className="fc-label">{t('auth.fullName')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="fc-input"
                  />
                </>
              )}

              <label className="fc-label">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                className="fc-input"
              />

              <label className="fc-label">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMain()}
                className="fc-input"
              />

              <button onClick={handleMain} disabled={busy} className="fc-btn">
                {busy ? t('auth.processing') : mode === 'signup' ? t('auth.signup') : t('auth.login')}
              </button>

              <div className="fc-links">
                {mode === 'login' && (
                  <button onClick={handleForgot} className="fc-link">
                    {t('auth.forgot')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setMsg(null);
                  }}
                  className="fc-link fc-link-right"
                >
                  {mode === 'login' ? t('auth.createAccount') : t('auth.backToLogin')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fc-foot">Mega Jutamas Sdn Bhd · Miri, Sarawak</div>

      <style>{`
        :root{
          --fc-hand:'Patrick Hand','Bradley Hand','Segoe Print','Comic Sans MS',cursive;
          --fc-ink:#173a2b;
          --fc-green:#0f6e46;
          --fc-grid:rgba(15,110,70,.13);
          --fc-grid-5:rgba(15,110,70,.24);
        }

        /* ── canvas the book is lying on ── */
        .fc-desk{
          position:relative;min-height:100vh;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:34px 14px 22px;
          background:radial-gradient(ellipse at 50% 32%,#2c3a2c 0%,#1c261d 60%,#121a13 100%);
        }
        .fc-lang{position:fixed;top:14px;right:14px;z-index:30}

        /* ── the book ── */
        .fc-book{
          position:relative;width:100%;max-width:430px;
          border-radius:6px 6px 16px 16px;
          box-shadow:0 26px 60px rgba(0,0,0,.55),0 3px 0 #cdd2c4,0 6px 0 #b5bbab;
          animation:fcIn .5s ease both;
        }
        @keyframes fcIn{
          from{opacity:0;transform:translateY(16px) scale(.985)}
          to{opacity:1;transform:none}
        }

        /* spiral: rings arch over the top edge */
        .fc-rings{
          position:absolute;top:-15px;left:0;right:0;z-index:4;
          display:flex;justify-content:space-between;padding:0 20px;
          pointer-events:none;
        }
        .fc-rings i{
          width:19px;height:31px;border:3px solid #c3cad3;border-radius:50%;
          background:transparent;
          box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.45);
        }

        /* kraft cover flap */
        .fc-cover{
          position:relative;overflow:hidden;
          border-radius:6px 6px 0 0;
          padding:20px 18px 15px;
          background:
            repeating-linear-gradient(114deg,rgba(255,255,255,.055) 0 2px,transparent 2px 6px),
            linear-gradient(#c89a62,#b07f4a 60%,#9d6f3f);
          box-shadow:inset 0 -4px 10px rgba(0,0,0,.22);
        }
        .fc-holes{
          position:absolute;top:6px;left:0;right:0;
          display:flex;justify-content:space-between;padding:0 24px;
        }
        .fc-holes i{
          width:11px;height:7px;border-radius:50%;
          background:rgba(48,32,17,.75);
          box-shadow:inset 0 1px 1px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.18);
        }
        .fc-cover-in{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .fc-brand{
          font-size:9.5px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;
          color:rgba(52,32,14,.62);
        }
        .fc-title{
          font-family:var(--fc-hand);
          font-size:33px;line-height:1.05;color:#33200e;margin-top:2px;
        }
        .fc-sub{
          font-size:9.5px;font-weight:900;letter-spacing:.24em;text-transform:uppercase;
          color:rgba(52,32,14,.55);margin-top:3px;
        }
        /* the red 555 sticker, stuck on slightly crooked */
        .fc-555{
          flex:0 0 auto;text-align:center;
          background:linear-gradient(#d0202f,#a5121f);
          color:#ffe9b8;border:2px solid rgba(255,233,184,.6);
          border-radius:5px;padding:6px 10px 5px;
          transform:rotate(4.5deg);
          box-shadow:1px 2px 6px rgba(0,0,0,.35);
        }
        .fc-555 b{display:block;font-size:19px;font-weight:900;letter-spacing:.06em;line-height:1}
        .fc-555 i{
          display:block;font-style:normal;font-size:7px;font-weight:700;
          letter-spacing:.22em;margin-top:2px;color:rgba(255,233,184,.75);
        }

        /* graph paper */
        .fc-page{
          padding:20px 18px 24px;
          border-radius:0 0 16px 16px;
          background-color:#fbfdf6;
          background-image:
            linear-gradient(var(--fc-grid) 1px,transparent 1px),
            linear-gradient(90deg,var(--fc-grid) 1px,transparent 1px),
            linear-gradient(var(--fc-grid-5) 1px,transparent 1px),
            linear-gradient(90deg,var(--fc-grid-5) 1px,transparent 1px);
          background-size:22px 22px,22px 22px,110px 110px,110px 110px;
        }

        .fc-label{
          display:block;
          font-family:var(--fc-hand);
          font-size:18px;color:var(--fc-ink);
          margin:0 0 3px 2px;
        }
        .fc-label:not(:first-child){margin-top:12px}

        /* boxes drawn by hand, not printed */
        .fc-input{
          width:100%;padding:11px 14px;
          font-family:var(--fc-hand);font-size:20px;color:#12281f;
          background:rgba(255,255,255,.75);
          border:2px solid #40573f;
          border-radius:15px 9px 16px 8px / 9px 16px 8px 15px;
          outline:none;-webkit-appearance:none;
          transition:box-shadow .15s,border-color .15s;
        }
        .fc-input:focus{
          border-color:var(--fc-green);
          box-shadow:3px 3px 0 rgba(15,110,70,.22);
        }

        .fc-btn{
          width:100%;margin-top:18px;padding:14px;
          background:var(--fc-green);color:#f1fff7;
          border:2px solid #0a4a2f;
          border-radius:15px 9px 16px 8px / 9px 16px 8px 15px;
          box-shadow:4px 4px 0 rgba(10,74,47,.32);
          font-weight:900;font-size:12px;letter-spacing:.17em;text-transform:uppercase;
          cursor:pointer;transition:transform .12s,box-shadow .12s,background .15s;
        }
        .fc-btn:hover{background:#128052}
        .fc-btn:active{transform:translate(4px,4px);box-shadow:0 0 0 rgba(10,74,47,.32)}
        .fc-btn:disabled{opacity:.6;cursor:default;transform:none}

        .fc-links{display:flex;align-items:baseline;margin-top:14px}
        .fc-link{
          font-family:var(--fc-hand);font-size:17px;
          color:var(--fc-ink);background:none;border:none;
          border-bottom:1.5px dashed rgba(23,58,43,.45);
          padding:0 1px;cursor:pointer;
        }
        .fc-link:hover{color:var(--fc-green);border-bottom-color:rgba(15,110,70,.65)}
        .fc-link-right{margin-left:auto}

        /* notes written in the margin */
        .fc-note{
          font-family:var(--fc-hand);font-size:18px;line-height:1.2;
          padding:4px 2px 6px;margin-bottom:12px;
          border-bottom:2px solid;
        }
        .fc-note-err{color:#b3261e;border-bottom-color:rgba(179,38,30,.45)}
        .fc-note-ok{color:#0f6e46;border-bottom-color:rgba(15,110,70,.45)}
        .fc-note-warn{color:#9a6206;border-bottom-color:rgba(154,98,6,.45)}

        .fc-foot{
          margin-top:22px;
          font-family:var(--fc-hand);font-size:15px;
          color:rgba(240,255,240,.3);text-align:center;
        }

        @media (max-width:360px){
          .fc-title{font-size:29px}
          .fc-rings{padding:0 14px}
          .fc-rings i{width:16px;height:27px}
        }
      `}</style>
    </div>
  );
}
