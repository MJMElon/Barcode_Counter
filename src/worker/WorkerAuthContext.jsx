import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from './workerApi.js';
import { uploadIdPhoto } from './workerIdPhoto.js';
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
  /* Registered, but the photograph did not make it. Carried across the
     re-render that signing up causes, so the pending screen can say so —
     see signUp below. */
  const [photoWarning, setPhotoWarning] = useState(false);

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

  /* Signing up signs you in, on the same session a PIN would have made. Not
     for convenience: the answer to "did that work" is then the portal itself
     saying their details are with the office, rather than a message on a
     login screen they have to believe. */
  /**
   * Register, and put a face to the name if one was offered.
   *
   * The photograph is sent HERE rather than from the cover, and the ordering
   * is the reason: setIdentity re-renders the portal around the new worker
   * and takes the cover off the screen, so an upload started there would
   * finish into a component nobody is looking at and report its failure to
   * nothing at all. Both happen before the portal is handed over.
   *
   * A photograph that will not go up does NOT undo the registration — they
   * are on the register, which is what they came to do, and the office can
   * add a photo to their record afterwards. It sets a warning instead, which
   * the screen they land on shows, because a worker who took a photograph
   * and is shown only "welcome" will believe the office has their face.
   */
  const signUp = useCallback(async (name, pin, photo = null) => {
    const who = await api.signUp(name, pin);
    api.keepToken(who.token);
    if (photo) {
      try {
        await uploadIdPhoto(who.token, photo);
      } catch (e) {
        console.warn('[worker] the photo did not upload:', e && e.message);
        setPhotoWarning(true);
      }
    }
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
    /* Signed up, but nobody has filed them under a nursery yet. The database
       is the one that says so — see worker_pending — because it is the one
       refusing to answer anything else about them. */
    pending: !!(identity && identity.pending),
    loading,
    offline,
    /* They registered, and their photograph did not go up with it. Shown on
       the screen they land on rather than on the cover they have already
       left behind. */
    photoWarning,
    signIn,
    signUp,
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
