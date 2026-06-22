import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import TopNav from './TopNav.jsx';

export default function Dashboard() {
  const { staffName } = useAuth();
  const { t } = useLang();

  const modules = [
    { to: '/do', icon: '📋', tint: 'bg-emerald-100', title: t('dash.doTitle'), desc: t('dash.doDesc') },
    { to: '/scan', icon: '📷', tint: 'bg-blue-100', title: t('dash.scanTitle'), desc: t('dash.scanDesc') },
  ];

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title="MJM Nursery AI" />
      <div className="max-w-[900px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-black text-slate-800 uppercase tracking-wide">{t('dash.modules')}</h1>
          <p className="text-xs font-bold text-slate-400 mt-1">{t('dash.welcome', { name: staffName })}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modules.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="bg-white rounded-[20px] border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,.12)] hover:-translate-y-1 hover:border-emerald-500 transition-all p-5 flex items-center gap-4 no-underline"
            >
              <div className={`w-14 h-14 ${m.tint} rounded-2xl flex items-center justify-center text-3xl shrink-0`}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide leading-tight">
                  {m.title}
                </h3>
                <p className="text-[11px] font-bold text-slate-400 mt-1.5 leading-snug">{m.desc}</p>
                <div className="flex items-center gap-2 mt-2">
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
