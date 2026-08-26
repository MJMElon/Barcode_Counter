import { useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { BOOK_COVER_CSS, COVER_OCHRE } from '../components/bookCover.js';
import { useWorker } from './WorkerAuthContext.jsx';

/*
 * The 555 Worker Portal's front door — the same exercise-book cover as the FC
 * Portal, printed on ochre board. Same masthead, same fields, same button;
 * the stylesheet is literally the same file (components/bookCover.js), so
 * when one cover is redesigned this one is redesigned with it.
 *
 * One field on it, and one field only: the PIN. A Field Conductor signs in
 * with an e-mail address and a password because a Field Conductor has an
 * office account; a worker has a number the office wrote on their row of the
 * Payroll register, and asking them for anything more is asking them for
 * something they were never given. No sign-up link either — a worker cannot
 * make themselves an account, and offering one would only teach forty people
 * to tap something that cannot work.
 */
export default function WorkerCover() {
  const { t } = useLang();
  const { signIn, offline } = useWorker();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSignIn() {
    if (!pin.trim()) return setErr(t('wk.enterPin'));
    setBusy(true);
    setErr(null);
    try {
      await signIn(pin);
      // On success the portal re-renders around the signed-in worker.
    } catch (e) {
      setErr((e && e.message) || t('wk.signInFailed'));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bk-page" style={COVER_OCHRE}>

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
          <div className="bk-portal">{t('wk.portal')}</div>

          <div className="bk-lines">
            {offline && <div className="bk-note bk-warn">{t('wk.offline')}</div>}
            {err && <div className="bk-note bk-err">{err}</div>}

            <input
              /* Not type="password": this is a door number, the worker is
                 standing in a field, and a PIN they cannot see is a PIN they
                 key wrong.

                 Not type="tel" either, though a number pad would suit a PIN
                 of digits. A PIN is letters and digits now (see the office
                 repo's shared/allow_npayroll_worker_pin_letters.sql), and a
                 number pad cannot type AB12 at all — the worker would be left
                 tapping at a keyboard with no way to key their own PIN.

                 Kept to the characters the column actually allows, and
                 uppercased as it is keyed: the register stores capitals, so
                 what a worker sees in the box is what is on their slip. */
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder={t('wk.pin')}
              className="bk-field"
              style={{ letterSpacing: '.18em' }}
            />

            <button onClick={handleSignIn} disabled={busy} className="bk-btn">
              {busy ? t('wk.signingIn') : t('wk.signIn')}
            </button>

            <div className="bk-links">
              <span className="bk-link" style={{ cursor: 'default', borderBottom: 0, opacity: 0.75 }}>
                {t('wk.askOffice')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{BOOK_COVER_CSS}</style>
    </div>
  );
}
