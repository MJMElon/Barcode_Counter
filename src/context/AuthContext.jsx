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
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      // Knowing there IS a session is enough to render the app. The ops gate
      // is a network round-trip; waiting for it put a loading screen in front
      // of every entry. It now resolves behind the app and only bounces
      // somebody out if it comes back denied.
      setSession(sess);
      setLoading(false);
      if (sess) runOpsGate(sess);
    });

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

    return () => sub.subscription.unsubscribe();
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
