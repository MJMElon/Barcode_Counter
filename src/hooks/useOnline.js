import { useEffect, useRef, useState } from 'react';

// Tracks browser online/offline state.
export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

// Runs `fn` on mount and then every `ms` while online. Also re-runs immediately
// when the connection comes back. Used for the ~1 minute auto-sync.
export function useAutoSync(fn, ms = 60000) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (navigator.onLine) saved.current();
    };
    tick(); // initial
    timer = setInterval(tick, ms);
    const onUp = () => saved.current();
    window.addEventListener('online', onUp);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onUp);
    };
  }, [ms]);
}
