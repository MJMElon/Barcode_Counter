import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { useWorker } from './WorkerAuthContext.jsx';
import { describeBoundary } from './workerApi.js';
import WorkerNav from './WorkerNav.jsx';

/*
 * The worker's landing page: their name, the ground they are responsible for,
 * and the two doors — Maintenance, and Settings for a supervisor.
 *
 * The boundary is printed here on purpose. A worker who taps Maintenance and
 * finds four plots where they expected nine needs to know that is a setting
 * somebody chose, not the app losing plots.
 */
export default function WorkerHome() {
  const { t } = useLang();
  const { worker, modules, boundary } = useWorker();

  const doors = [
    ...(modules.maintenance
      ? [{
          to: '/worker/maintenance',
          icon: '🛠️',
          tint: 'bg-teal-100',
          title: t('wk.maintTitle'),
          desc: t('wk.maintDesc'),
        }]
      : []),
    ...(modules.settings
      ? [{
          to: '/worker/settings',
          icon: '⚙️',
          tint: 'bg-slate-200',
          title: t('wk.settingsTitle'),
          desc: t('wk.settingsDesc'),
        }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <WorkerNav title={worker ? worker.name : 'MJM Nursery'} />

      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Who you are and where you work — the cover page of the book. */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-4 mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em]">
                {t('wk.worker')}
              </div>
              <div className="text-lg font-black text-slate-800 truncate">
                {worker ? worker.name : ''}
              </div>
            </div>
            {worker && worker.worker_no && (
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                {worker.worker_no}
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em]">
              {t('wk.boundary')}
            </div>
            <div className="text-[13px] font-bold text-slate-700 mt-0.5 break-words">
              {describeBoundary(boundary, t)}
            </div>
          </div>
        </div>

        {doors.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] font-semibold text-amber-900">
            {t('wk.nothingOpen')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {doors.map((d) => (
              <Link
                key={d.to}
                to={d.to}
                className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,.12)] hover:-translate-y-0.5 hover:border-emerald-600 transition-all p-4 flex items-center gap-3.5 no-underline"
              >
                <div className={`w-12 h-12 ${d.tint} rounded-xl flex items-center justify-center text-2xl shrink-0`}>
                  {d.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-black text-slate-800 uppercase tracking-wide leading-tight">
                    {d.title}
                  </h3>
                  <div className="text-[11px] font-semibold text-slate-500 mt-1 leading-snug">
                    {d.desc}
                  </div>
                </div>
                <div className="text-slate-300 font-black text-lg shrink-0">›</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
