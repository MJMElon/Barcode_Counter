import { useEffect, useRef, useState } from 'react';
import EntryTab from './EntryTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import { clearAll, seedDemo } from './demo.js';
import { syncPalms } from './sync.js';
import { applyCachedOfficeConfig, refreshOfficeConfig } from './officeConfig.js';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canPalms, visibleNurseries } from '../../lib/access.js';
import { useLang } from '../../context/LanguageContext.jsx';
import { NURSERIES, loadDB } from './data.js';

// PALMS — Plot Activity Log Monitoring System, ported from the standalone
// NurseryPALMS app into the portal: portal login and theme, EN/BM via the
// portal language toggle, data still offline on the device (localStorage).
//
// One screen: the daily status railway. The monitoring board and the motion
// study now live in the nursery operation management system, and the Culling
// Calculator is a page of its own at /culling — so there is no tab row here
// any more, and PALMS means updating plot status.
export default function PalmsModule() {
  const { staffName, permissions } = useAuth();
  // Which nurseries this person may see, from FC Scan Portal → User Access.
  // The names are matched loosely — shared_plots writes "UNN 1" where PALMS
  // says "UNN1".
  const nurseryKeys = visibleNurseries(permissions, Object.keys(NURSERIES));
  // Settings is its own tick: it configures the whole module, so it is not
  // something every Field Conductor should be able to change.
  const maySetUp = canPalms(permissions, 'settings');
  const { t } = useLang();

  // The DB is a plain mutable object persisted to localStorage; a tick
  // counter re-renders after each mutation (same pattern as the source app's
  // re-render calls).
  /* Which plots exist and which statuses can be chosen are the office's, not
     this app's. The cache is applied before the first render so the screen
     never flashes the built-in list first; the server is asked straight
     after, in the same effect as the sync. */
  const cfgRef = useRef(false);
  if (!cfgRef.current) { applyCachedOfficeConfig(); cfgRef.current = true; }

  const dbRef = useRef(null);
  if (!dbRef.current) dbRef.current = loadDB();
  const db = dbRef.current;
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  /* PALMS is no longer only this phone's. Everything local goes up and
     everybody else's comes down, into the very object the screens are
     holding, so the merge shows without a reload.
     A device with nothing gets the real plots this way. Only if the server
     has nothing either — the tables are new, or this is a demo — does it
     fall back to generated stages, so there is still something to look at.
     Demo entries are flagged and never sent (see sync.js). */
  useEffect(() => {
    let live = true;
    refreshOfficeConfig().then((changed) => { if (live && changed) refresh(); });
    syncPalms(db).then((r) => {
      if (!live) return;
      if (r) refresh();
      if (!Object.keys(dbRef.current.logs || {}).length) replaceDB(seedDemo());
    });
    return () => { live = false; };
  }, []);

  // seedDemo() and clearAll() persist for themselves and hand back the new
  // DB; this only has to point at it and redraw.
  const replaceDB = (next) => {
    dbRef.current = next;
    refresh();
  };

  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 2500);
  };

  const onSettings = maySetUp ? () => setShowSettings((v) => !v) : undefined;

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      {/* Settings lives on the cog in the bar: it is a place you set up once
          and rarely return to. */}
      <TopNav
        title="PALMS"
        subtitle="FC Portal"
        user={staffName}
        back="/dashboard"
        onSettings={onSettings}
        settingsOn={showSettings}
      />

      <div className="max-w-[1000px] mx-auto px-3 sm:px-6 py-4 space-y-3">
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

            {/* Demo data tools. They used to sit under the monitoring board;
                they reset the plot log itself, which the Settings reset does
                not touch, so they moved here with it rather than going away. */}
            <div className="text-center text-[11px] font-bold text-slate-400 pt-1">
              {t('pm.demoTools')}{' '}
              <button
                onClick={() => {
                  replaceDB(seedDemo());
                  flash(t('pm.sampleLoaded'));
                }}
                className="text-emerald-600 hover:underline cursor-pointer"
              >
                {t('pm.fillSample')}
              </button>{' '}
              ·{' '}
              <button
                onClick={() => {
                  replaceDB(clearAll());
                  flash(t('pm.cleared'));
                }}
                className="text-rose-500 hover:underline cursor-pointer"
              >
                {t('pm.clearAll')}
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}
