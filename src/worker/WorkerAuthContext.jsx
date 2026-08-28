import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from './workerApi.js';
import { visibleModules } from '../lib/portalSettings.js';

/*
 * Who is holding the phone, in the worker portal.
 *
 * Deliberately separate from the FC portal's AuthContext. The two portals
 * share a build and a domain but not a way in: a Field Conductor has a
 * Supabase account, a worker has a PIN and a token. Folding them together
 * would mean one screen asking "am I signed in?" and getting an answer about
 * the other kind of person.
 *
 * The two can be signed in at once on the same phone without interfering —
 * they keep different things in storage and neither reads the other's.
 */

const WorkerAuthContext = createContext(null);

export function WorkerAuthProvider({ children }) {
  // `identity` is what the database says: { token, worker, modules, boundary }
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the office cannot be reached at all, as opposed to the token
  // simply having expired. The cover says which, because "check your signal"
  // and "sign in again" are different instructions.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const token = api.savedToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .whoami(token)
      .then((who) => {
        if (!alive) return;
        if (who) setIdentity(who);
        else api.keepToken(null); // expired or signed out elsewhere
        setOffline(false);
      })
      .catch(() => {
        // The token is kept: a worker in a plot with no signal has not been
        // signed out, they are just out of reach. It is tried again next time.
        if (alive) setOffline(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (pin) => {
    const who = await api.signIn(pin);
    api.keepToken(who.token);
    setIdentity(who);
    setOffline(false);
    return who;
  }, []);

  const signOut = useCallback(async () => {
    const token = identity && identity.token;
    setIdentity(null);
    api.keepToken(null);
    await api.signOut(token);
  }, [identity]);

  /* Settings changes a worker's own access as readily as anyone else's, so
     the screen needs a way to pick the new answer up without a sign-out. */
  const refresh = useCallback(async () => {
    const token = api.savedToken();
    if (!token) return null;
    const who = await api.whoami(token);
    if (who) setIdentity(who);
    else {
      api.keepToken(null);
      setIdentity(null);
    }
    return who;
  }, []);

  const value = {
    identity,
    token: identity ? identity.token : null,
    worker: identity ? identity.worker : null,
    /* What this worker was given, with the company's Worker Portal column over
       the top of it — System Setting → Portal View & Function. Off there beats
       on here, and it is applied once, at the door, so the home screen and the
       route guard behind it cannot end up disagreeing. */
    modules: visibleModules(identity && identity.modules, identity && identity.company),
    /* Which functions inside a module this worker gets — the same switches
       the office sets per Field Conductor, set here per worker in Settings.
       Absent on a database that has not re-run create_worker_portal.sql, and
       absent means the defaults, so the portal works either way. */
    actions: (identity && identity.actions) || {},
    /* The company's master switches for the worker portal — System Setting →
       Portal View & Function. They arrive with the sign-in because a PIN
       sign-in is `anon` and cannot read that table for itself. Absent on a
       database that has not re-run create_worker_portal.sql, and absent means
       nothing is vetoed, so the portal works either way. */
    company: (identity && identity.company) || null,
    boundary: (identity && identity.boundary) || {},
    loading,
    offline,
    signIn,
    signOut,
    refresh,
  };

  return <WorkerAuthContext.Provider value={value}>{children}</WorkerAuthContext.Provider>;
}

export function useWorker() {
  const ctx = useContext(WorkerAuthContext);
  if (!ctx) throw new Error('useWorker outside WorkerAuthProvider');
  return ctx;
}
