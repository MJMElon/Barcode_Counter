import { useState } from 'react';
import CullingTab from './CullingTab.jsx';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { visibleNurseries } from '../../lib/access.js';
import { useLang } from '../../context/LanguageContext.jsx';
import { NURSERIES } from './data.js';

// Culling Calculator — its own page at /culling.
//
// It used to be the third tab of PALMS, which meant a Field Conductor going
// out to count pokok inang had to open PALMS and know the calculator was
// filed under it. Counting is a job of its own, so it gets its own card on
// the dashboard and its own screen with nothing else on it.
//
// The plot figures still come from the same PALMS stores, so which plots the
// calculator lists is still decided by their stage in PALMS.
export default function CullingModule() {
  const { staffName, permissions, session } = useAuth();
  // Same nursery scoping as every other nursery-aware screen, from
  // FC Scan Portal → User Access.
  // The calculator's own nursery list — set separately from PALMS.
  const nurseryKeys = visibleNurseries(permissions, Object.keys(NURSERIES), null, 'culling');
  const { t } = useLang();

  const [toast, setToast] = useState(null);
  const flash = (msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#050a0e] fade-enter">
      {/* Dark, because the screen is a calculator and the calculator is the
          screen. The Scan module already runs dark for the same reason — a
          tool you hold up in the sun rather than a page you read. */}
      <TopNav
        title={t('cull.title')}
        subtitle="FC Portal"
        user={staffName}
        back="/dashboard"
        theme="dark"
      />

      <div className="px-3 py-4 sm:py-7">
        <CullingTab
          t={t}
          staffName={staffName}
          userId={session?.user?.id || null}
          flash={flash}
          nurseryKeys={nurseryKeys}
        />
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}
