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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // null = not yet checked, true / false = ops-gate result
  const [allowed, setAllowed] = useState(null);
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
      if (resp && !resp.error) ok = hasOpsAccess(resp.data);
    } catch (e) {
      console.warn('[ops-gate] profile read failed (allowing through):', e);
    }
    setAllowed(ok);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (sess) runOpsGate(sess);
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(sess);
      if (event === 'SIGNED_OUT' || !sess) {
        setAllowed(null);
        setLoading(false);
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
  }

  const staffName = session
    ? session.user.user_metadata?.full_name || session.user.email
    : '';

  return (
    <AuthContext.Provider
      value={{ session, loading, allowed, recovering, setRecovering, signOut, staffName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
