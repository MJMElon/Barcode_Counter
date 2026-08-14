import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { canMaintain, canPlotStatus } from '../lib/access.js';
import { useLang } from '../context/LanguageContext.jsx';
import TopNav from './TopNav.jsx';
import CollectionBoard from './CollectionBoard.jsx';

export default function Dashboard() {
  const { staffName, permissions } = useAuth();
  const { t } = useLang();

  // Order: Scan Barcode Counter first, then Issue Collection DO, Plot Status,
  // then Maintenance. Plot Status and Maintenance are each hidden for anyone
  // whose FC Scan Portal User Access has that page switched off. Scan and DO
  // are unchanged — they are open to everyone who can reach the portal.
  const modules = [
    { to: '/scan', icon: '📷', tint: 'bg-blue-100', title: t('dash.scanTitle') },
    { to: '/do', icon: '📋', tint: 'bg-emerald-100', title: t('dash.doTitle') },
    ...(canPlotStatus(permissions, 'view')
      ? [{ to: '/plot-status', icon: '🚦', tint: 'bg-amber-100', title: t('dash.plotStatusTitle') }]
      : []),
    ...(canMaintain(permissions, 'view')
      ? [{ to: '/maintenance', icon: '🛠️', tint: 'bg-teal-100', title: t('dash.maintTitle') }]
      : []),
    { to: '/palms', icon: '🪴', tint: 'bg-violet-100', title: t('dash.palmsTitle') },
  ];

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title="MJM Nursery" subtitle="FC Portal" user={staffName} portal />
      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* "TV" board: who is coming today to collect seedlings */}
        <CollectionBoard />

        {/* Modules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {modules.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,.12)] hover:-translate-y-0.5 hover:border-emerald-500 transition-all p-4 flex items-center gap-3.5 no-underline"
            >
              <div className={`w-12 h-12 ${m.tint} rounded-xl flex items-center justify-center text-2xl shrink-0`}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-black text-slate-800 uppercase tracking-wide leading-tight">
                  {m.title}
                </h3>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t('common.active')}</span>
                </div>
              </div>
              <div className="text-slate-300 font-black text-lg shrink-0">›</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
