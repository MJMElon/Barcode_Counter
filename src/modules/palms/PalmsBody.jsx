import { useEffect, useRef, useState } from 'react';
import EntryTab from './EntryTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import { clearAll, seedDemo } from './demo.js';
import { syncPalms } from './sync.js';
import { applyCachedOfficeConfig, refreshOfficeConfig } from './officeConfig.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canPalms, visibleNurseries } from '../../lib/access.js';
import { useLang } from '../../context/LanguageContext.jsx';
import { NURSERIES, loadDB } from './data.js';

/**
 * PALMS itself — everything except the frame around it.
 *
 * Split out from PalmsModule so the same screen can be a page (the /palms
 * route, for a bookmark or a link) and the floating window the train opens.
 * Keying the day in is a two-minute job you should not have to leave the
 * screen you were on to do, and two copies of it would be two things to keep
 * in step.
 *
 * `header` is a render prop rather than a fixed bar: the page draws the
 * portal's TopNav, the window draws its own title bar, and both need the same
 * settings cog wired to the same state.
 */
export default function PalmsBody({ header, onDayChange }) {
  const { staffName, permissions } = useAuth();
  const { t } = useLang();

  // Which nurseries this person may see, from 555 FC Portal → User Access.
  // The names are matched loosely — shared_plots writes "UNN 1" where PALMS
  // says "UNN1".
  const nurseryKeys = visibleNurseries(permissions, Object.keys(NURSERIES));
  // Settings is its own tick: it configures the module, not one person's view.
  const maySetUp = canPalms(permissions, 'settings');

  /* Which plots exist and which statuses can be chosen are the office's, not
     this app's. The cache is applied before the first render so the screen
     never flashes the built-in list first; the server is asked straight
     after, in the same effect as the sync. */
  const cfgRef = useRef(false);
  if (!cfgRef.current) { applyCachedOfficeConfig(); cfgRef.current = true; }

  // The DB is a plain mutable object persisted to localStorage; a tick
  // counter re-renders after each mutation.
  const dbRef = useRef(null);
  if (!dbRef.current) dbRef.current = loadDB();
  const db = dbRef.current;
  const [, setTick] = useState(0);

  /* Anything that changes the day's answer tells whoever is holding this —
     the floating train, so the engine starts steaming the moment the last
     plot is keyed in, rather than on the next navigation. */
  const refresh = () => {
    setTick((n) => n + 1);
    if (onDayChange) onDayChange();
  };

  const replaceDB = (next) => {
    dbRef.current = next;
    refresh();
  };

  useEffect(() => {
    let live = true;
    refreshOfficeConfig().then((changed) => { if (live && changed) refresh(); });
    syncPalms(db).then((r) => {
      if (!live) return;
      if (r) refresh();
      if (!Object.keys(dbRef.current.logs || {}).length) replaceDB(seedDemo());
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 2500);
  };

  return (
    <>
      {header && header({
        maySetUp,
        showSettings,
        toggleSettings: maySetUp ? () => setShowSettings((v) => !v) : undefined,
      })}

      <div className="space-y-3">
        {showSettings && maySetUp ? (
          <SettingsTab db={db} t={t} flash={flash} refresh={refresh} />
        ) : (
          <>
            <EntryTab
              db={db}
              t={t}
              staffName={staffName}
              refresh={refresh}
              flash={flash}
              nurseryKeys={nurseryKeys}
            />

            <div className="text-center text-[11px] font-bold text-slate-400 pt-1">
              {t('pm.demoTools')}{' '}
              <button
                onClick={() => { replaceDB(seedDemo()); flash(t('pm.sampleLoaded')); }}
                className="text-emerald-600 hover:underline cursor-pointer"
              >
                {t('pm.fillSample')}
              </button>{' '}
              ·{' '}
              <button
                onClick={() => { replaceDB(clearAll()); flash(t('pm.cleared')); }}
                className="text-rose-500 hover:underline cursor-pointer"
              >
                {t('pm.clearAll')}
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-[70]">
          {toast}
        </div>
      )}
    </>
  );
}
