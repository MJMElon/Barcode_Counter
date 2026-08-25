import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang, LangToggle } from '../context/LanguageContext.jsx';

// Login / Sign-up / Forgot-password / Recovery screen, on the shared Supabase
// project — the same accounts as ai.mjmnursery.com.
//
// Dressed as the cover of the 555 exercise book everyone in the nursery
// already writes in: the red logotype across the top, a lot of blank cover,
// and "Name……………" ruled near the foot — which is where you sign in.
//
// The Auditor Portal wears the same cover in pink. Only the colour differs,
// exactly like the books themselves.
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
    <div className="bk-page">
      <div className="bk-lang">
        <LangToggle dark />
      </div>

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

      <style>{`
        /* ══ The 555 exercise book — cover ══
           The Auditor Portal's login is the same book in pink — it differs
           only in the three --bk-cover values below, and should stay that
           way: one book, a pile of colours. NOTE: the masthead here has since
           been restacked (house name, then 555, then the portal) and the
           Auditor Portal has not been brought across yet. */
        .bk-page{
          --bk-cover:#a9c5de; --bk-cover-2:#93b3d1; --bk-cover-3:#84a4c3;  /* FC: blue */
          --bk-ink:#23303f;
          /* the logotype and the button wear MJM's dark green, not the
             printer's red the books themselves are stamped with */
          --bk-green:#1f7a45; --bk-green-2:#155c33; --bk-green-3:#0f4a29; --bk-green-4:#0b3d21;
          --bk-quiet:rgba(35,48,63,.62);   /* MJM Nursery and the portal line share it */
          --bk-hand:'Caveat','Bradley Hand','Segoe Script','Comic Sans MS',cursive;

          position:relative;min-height:100vh;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:26px 16px 20px;
          background:radial-gradient(ellipse at 50% 34%,#3a322b 0%,#221d19 62%,#14100e 100%);
        }
        .bk-lang{position:fixed;top:14px;right:14px;z-index:30}

        .bk-book{position:relative;width:100%;max-width:400px;animation:bkIn .5s ease both}
        @keyframes bkIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}

        .bk-edges{position:absolute;inset:0}
        .bk-edges i{
          position:absolute;top:7px;bottom:5px;border-radius:0 3px 3px 0;
          box-shadow:2px 2px 5px rgba(0,0,0,.35);
        }
        .bk-edges i:nth-child(1){right:-13px;width:15px;background:#d7dfb8}
        .bk-edges i:nth-child(2){right:-9px;width:13px;background:#f2ea9e;top:12px;bottom:10px}
        .bk-edges i:nth-child(3){right:-5px;width:11px;background:#fdf9e6;top:17px;bottom:15px}

        .bk-cover{
          position:relative;
          background:
            radial-gradient(ellipse at 32% 62%,rgba(255,255,255,.18),transparent 46%),
            radial-gradient(ellipse at 78% 18%,rgba(0,0,0,.05),transparent 52%),
            repeating-linear-gradient(101deg,rgba(255,255,255,.045) 0 2px,transparent 2px 6px),
            linear-gradient(160deg,var(--bk-cover) 0%,var(--bk-cover-2) 78%,var(--bk-cover-3) 100%);
          border-radius:3px 6px 6px 3px;
          padding:30px 26px 26px;
          box-shadow:0 26px 60px rgba(0,0,0,.55),
                     inset 0 0 0 1px rgba(255,255,255,.16),
                     inset 3px 0 0 rgba(0,0,0,.10);
          transform:rotate(-.4deg);
        }
        .bk-cover::before{
          content:'';position:absolute;left:0;top:0;bottom:0;width:9px;
          background:linear-gradient(90deg,rgba(0,0,0,.16),transparent);
          border-radius:3px 0 0 3px;
        }
        .bk-smudge{
          position:absolute;left:26%;top:56%;width:46%;height:15%;
          background:radial-gradient(ellipse,rgba(60,55,90,.13),transparent 68%);
          transform:rotate(-7deg);pointer-events:none;
        }

        /* The house name, above the book. Sized to read as a heading and
           still be plainly subordinate to the 555 under it. */
        .bk-brand{
          text-align:center;
          font-size:19px;font-weight:900;letter-spacing:.26em;text-transform:uppercase;
          color:var(--bk-quiet);
          margin-bottom:2px;
        }
        .bk-logo-wrap{display:flex;justify-content:center;margin-bottom:4px}
        .bk-logo{
          /* Grows with the phone rather than sitting at one fixed size: on a
             360px screen the cover is ~276px wide inside its padding, which
             27vw comfortably fits, and it stops growing on a tablet. */
          font-family:'Outfit',sans-serif;font-weight:900;font-style:italic;
          /* main's responsive sizing, kept: the shadow offsets are fixed px,
             so the centring correction below holds at every size. */
          font-size:clamp(88px,27vw,116px);line-height:.9;letter-spacing:-.02em;
          color:var(--bk-green);
          -webkit-text-stroke:1.5px #f4fbf6;paint-order:stroke fill;
          text-shadow:
            1px 1px 0 var(--bk-green-2),2px 2px 0 var(--bk-green-2),
            3px 3px 0 var(--bk-green-2),4px 4px 0 var(--bk-green-2),
            5px 5px 0 var(--bk-green-3),6px 6px 0 var(--bk-green-3),
            7px 7px 0 var(--bk-green-4),8px 8px 0 var(--bk-green-4),
            10px 12px 16px rgba(6,42,22,.4);
          /* The glyph box is centred, but the shadow only falls down-RIGHT and
             shadows do not take up layout, so the INK ends up right of centre.
             Measured off a render: at 0 the ink's centre of mass sits 8.4px
             right of the cover's, and every 1px of translate moves it 1px.
             -7px lands centre of mass and bounding box either side of zero
             (+1.4 / -1.5), which is as centred as it gets. */
          transform:translateX(-7px) rotate(-1.2deg);
        }
        .bk-portal{
          margin-top:14px;text-align:center;
          font-size:14px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;
          color:var(--bk-quiet);
        }

        /* The cover asks for your name on a ruled line; a phone in a
           nursery asks for a box big enough to hit with a thumb. Boxes
           win — drawn freehand, so they still belong on the cover. */
        .bk-lines{margin-top:34px}
        .bk-field{
          display:block;width:100%;height:54px;
          margin-bottom:13px;padding:0 15px;
          background:rgba(255,255,255,.6);
          border:1.5px solid rgba(35,48,63,.32);
          border-radius:10px 7px 12px 6px / 7px 12px 6px 10px;
          font-family:var(--bk-hand);font-size:23px;color:var(--bk-ink);
          outline:none;-webkit-appearance:none;
          transition:border-color .15s,box-shadow .15s,background .15s;
        }
        .bk-field::placeholder{
          font-family:'Outfit',sans-serif;
          font-size:13px;font-weight:700;letter-spacing:.02em;
          color:rgba(35,48,63,.42);
        }
        .bk-field:focus{
          background:rgba(255,255,255,.82);
          border-color:var(--bk-green);
          box-shadow:0 0 0 3px rgba(31,122,69,.16);
        }

        .bk-btn{
          width:100%;height:50px;margin-top:22px;
          background:var(--bk-green-2);color:#f2fbf5;
          border:2px solid rgba(9,58,32,.9);
          border-radius:10px 7px 12px 6px / 7px 12px 6px 10px;
          box-shadow:3px 3px 0 rgba(7,45,25,.35);
          transform:rotate(-.5deg);
          font-size:13px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;
          cursor:pointer;transition:transform .12s,box-shadow .12s,background .15s;
        }
        .bk-btn:hover{background:var(--bk-green)}
        .bk-btn:active{transform:rotate(-.5deg) translate(3px,3px);box-shadow:0 0 0}
        .bk-btn:disabled{opacity:.65;cursor:default;transform:rotate(-.5deg)}

        .bk-links{display:flex;align-items:baseline;margin-top:16px}
        .bk-link{
          font-family:var(--bk-hand);font-size:18px;color:var(--bk-ink);
          background:none;border:none;
          border-bottom:1.5px dashed rgba(35,48,63,.4);
          padding:0 1px;cursor:pointer;
        }
        .bk-link:hover{color:var(--bk-green);border-bottom-color:rgba(31,122,69,.6)}
        .bk-link-right{margin-left:auto}

        .bk-note{
          font-family:var(--bk-hand);font-size:19px;line-height:1.15;
          padding:2px 2px 4px;margin-bottom:14px;border-bottom:2px solid;
        }
        .bk-err{color:#8f1120;border-bottom-color:rgba(143,17,32,.45)}
        .bk-ok{color:#12603f;border-bottom-color:rgba(18,96,63,.45)}
        .bk-warn{color:#7a4a06;border-bottom-color:rgba(122,74,6,.45)}


        @media (max-width:360px){
          .bk-cover{padding:26px 20px 22px}
          /* Narrower cover, so ease the ceiling — the 555 still fills it. */
          .bk-logo{font-size:clamp(76px,28vw,96px)}
          .bk-brand{font-size:17px;letter-spacing:.22em}
          .bk-portal{letter-spacing:.24em;font-size:12.5px}
        }
        @media (min-height:800px){
          .bk-lines{margin-top:48px}
          .bk-cover{padding-top:40px;padding-bottom:32px}
        }
      `}</style>
    </div>
  );
}
