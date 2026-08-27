import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

// Staff-grade module access levels — same predicate as the hub / audit / mobile.
const STAFF_LEVELS = ['admin', 'normal', 'view', 'edit', 'manage', 'read', 'write', 'full', 'staff'];

function hasOpsAccess(profile) {
  if (!profile) return false;
  const p = profile.permissions || {};
  if (p.manage_users || p.can_verify_operation) return true;
  if (p.modules && typeof p.modules === 'object') {
    for (const k in p.modules) {
      if (p.modules[k] && STAFF_LEVELS.indexOf(String(p.modules[k]).toLowerCase()) !== -1) return true;
    }
  }
  return false;
}

/* The session Supabase already has in this browser, read synchronously so the
   app can render on the first paint. supabase.auth.getSession() returns the
   same thing but as a promise, and that one tick was long enough to show a
   loading screen in front of every entry. Anything doubtful — no token, past
   its expiry, unparseable — returns null and the normal async path decides. */
function cachedSession() {
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    if (!key) return null;
    const raw = JSON.parse(localStorage.getItem(key));
    const s = (raw && (raw.currentSession || raw)) || null;
    if (!s || !s.access_token || !s.user) return null;
    if (s.expires_at && Number(s.expires_at) * 1000 <= Date.now()) return null;
    return s;
  } catch (e) {
    return null;
  }
}

/* How long the app will wait for Supabase to say whether somebody is signed
   in before drawing itself anyway. Long enough that a slow phone on a nursery
   connection is not pushed to the sign-in screen while its answer is still in
   flight, short enough that a check which is never coming does not cost a
   Field Conductor his morning. */
export const AUTH_WAIT_MS = 8000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(cachedSession);
  // Already signed in ⇒ nothing to wait for before drawing the app.
  const [loading, setLoading] = useState(() => !cachedSession());
  // null = not yet checked, true / false = ops-gate result
  const [allowed, setAllowed] = useState(null);
  // The user's permissions JSONB from shared_profiles (set by the ops gate).
  // Modules read finer-grained flags from here, e.g. plot_status_nurseries.
  const [permissions, setPermissions] = useState(null);
  const [recovering, setRecovering] = useState(
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  );

  // Ops-access gate. Fail-open on read errors so a brief Supabase hiccup does
  // not lock real admins out. Runs deferred (outside onAuthStateChange) to
  // avoid the supabase-js auth-lock deadlock.
  async function runOpsGate(sess) {
    let ok = true;
    try {
      const resp = await supabase
        .from('shared_profiles')
        .select('role, user_type, permissions')
        .eq('id', sess.user.id)
        .maybeSingle();
      if (resp && !resp.error) {
        ok = hasOpsAccess(resp.data);
        setPermissions((resp.data && resp.data.permissions) || {});
      }
    } catch (e) {
      console.warn('[ops-gate] profile read failed (allowing through):', e);
    }
    setAllowed(ok);
    setLoading(false);
  }

  useEffect(() => {
    let answered = false;
    supabase.auth.getSession().then(
      ({ data: { session: sess } }) => {
        // Knowing there IS a session is enough to render the app. The ops gate
        // is a network round-trip; waiting for it put a loading screen in front
        // of every entry. It now resolves behind the app and only bounces
        // somebody out if it comes back denied.
        answered = true;
        setSession(sess);
        setLoading(false);
        if (sess) runOpsGate(sess);
      },
      (e) => {
        /* It failed rather than hung. Stop waiting, but do NOT throw away the
           session read out of storage — a failed check is not a sign-out. */
        answered = true;
        console.warn('[auth] the session check failed:', e);
        setLoading(false);
      }
    );

    /* And a promise can fail to settle at all. supabase-js takes a cross-tab
       lock before reading the token and goes to the network to refresh one
       that has expired, so a lock another tab never released, or a request
       that neither answers nor fails, leaves this pending for as long as the
       browser is open. Neither handler above ever runs, `loading` stays true,
       and the portal sits on its loading screen with no way past it — not
       even a reload, which begins the same wait again.

       So the waiting ends. Whatever has arrived by then is what the app is
       drawn from: with a session it opens, without one it shows the sign-in
       screen, and either is somewhere a person can act. A late answer is
       still honoured — the handler above and onAuthStateChange below both
       apply it whenever it comes. */
    const watchdog = setTimeout(() => {
      if (!answered) {
        console.warn('[auth] the session check did not answer in ' + AUTH_WAIT_MS +
                     'ms — drawing the app with what we have');
      }
      setLoading(false);
    }, AUTH_WAIT_MS);

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(sess);
      setLoading(false);
      if (event === 'SIGNED_OUT' || !sess) {
        setAllowed(null);
        setPermissions(null);
        return;
      }
      // Defer to release the auth lock before querying shared_profiles.
      setTimeout(() => runOpsGate(sess), 0);
    });

    return () => { clearTimeout(watchdog); sub.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    });
    sessionStorage.clear();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      /* ignore */
    }
    setSession(null);
    setAllowed(null);
    setPermissions(null);
  }

  const staffName = session
    ? session.user.user_metadata?.full_name || session.user.email
    : '';

  return (
    <AuthContext.Provider
      value={{ session, loading, allowed, permissions, recovering, setRecovering, signOut, staffName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
