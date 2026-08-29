import { useCallback, useEffect, useRef, useState } from 'react';
import * as T from './taskTrack.js';

/**
 * The phone's GPS, wired to one walked job.
 *
 * ONE at a time, deliberately. A worker is standing in one plot doing one
 * thing; two tracks running at once would be two lines drawn from the same
 * pocket, and neither of them would be a record of anything. Starting a second
 * job stops the first — see `start`.
 *
 * Everything about what a fix means lives in taskTrack.js, which has no React
 * in it and is tested in plain node. This file is the part that cannot be:
 * asking the browser for positions, and stopping asking.
 */
export function useWorkerTrack() {
  /* Whatever was running when the page went away, back as PAUSED. A worker
     whose phone locked mid-row finds the track where they left it rather than
     starting again. */
  const [session, setSession] = useState(() => T.load());
  const [denied, setDenied] = useState(false);
  // Re-rendered once a second while running, so the clock on the row moves.
  const [, tick] = useState(0);
  const watchRef = useRef(null);

  const put = useCallback((next) => {
    setSession(next);
    T.save(next);
    return next;
  }, []);

  const running = !!session && session.status === 'running';

  // Watching costs battery and is the one thing that must stop when it should.
  useEffect(() => {
    const geo = typeof navigator !== 'undefined' && navigator.geolocation;
    if (!running || !geo) return undefined;

    watchRef.current = geo.watchPosition(
      (pos) => {
        setDenied(false);
        const c = pos && pos.coords;
        if (!c) return;
        setSession((s) => {
          const next = T.fix(s, { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy });
          T.save(next);
          return next;
        });
      },
      (err) => {
        /* Permission refused is the only one worth saying out loud. A timeout
           or a temporary failure is what standing under a shade house looks
           like, and the row already says the line has stopped growing. */
        if (err && err.code === 1) setDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    return () => {
      if (watchRef.current != null && geo.clearWatch) geo.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [running]);

  // The clock. Only while running — a paused row's time is not moving.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = useCallback((task) => put(T.start(task)), [put]);
  /* Through setSession rather than put(), so the copy written to storage is
     the SAME object React is given. Saving one built from a `session` the
     callback closed over is how a track comes back off a locked phone a point
     short of where it was. */
  const pause  = useCallback(() => setSession((s) => { const n = T.pause(s);  T.save(n); return n; }), []);
  const resume = useCallback(() => setSession((s) => { const n = T.resume(s); T.save(n); return n; }), []);

  /** Stop, and hand back what should be saved with the record. */
  const stop = useCallback(() => {
    const payload = T.payload(session);
    put(null);
    setDenied(false);
    return payload;
  }, [session, put]);

  /** Throw the walk away without recording anything. */
  const cancel = useCallback(() => { put(null); setDenied(false); }, [put]);

  return {
    session,
    denied,
    running,
    trackingId: session ? session.id : null,
    elapsed: T.elapsed(session),
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
