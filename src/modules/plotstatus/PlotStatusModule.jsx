import { useEffect, useMemo, useState } from 'react';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  allowedNurseries,
  currentStatus,
  loadPlotStatusData,
  saveStatusEntry,
  todayStr,
} from './data.js';

// Daily plot status reporting for Field Conductors.
// Plots come from shared_plots (Seedling Stock Management settings); the
// stages come from the Life of Plot settings in Nursery Operation Management;
// which nurseries a user sees is set on the main portal's User Access.
export default function PlotStatusModule() {
  const { staffName, permissions } = useAuth();
  const { t } = useLang();

  const [plots, setPlots] = useState([]);
  const [stages, setStages] = useState([]);
  const [entriesByPlot, setEntriesByPlot] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nursery, setNursery] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // plot being updated
  const [toast, setToast] = useState(null);

  const allowed = allowedNurseries(permissions);

  const flash = (text) => {
    setToast(text);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 3000);
  };

  async function reload() {
    try {
      const d = await loadPlotStatusData();
      setPlots(d.plots);
      setStages(d.stages);
      setEntriesByPlot(d.entriesByPlot);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    reload();
  }, []);

  // Plots this user may see: nursery permission first, then UI filters.
  const visiblePlots = useMemo(() => {
    const q = query.toLowerCase().trim();
    return plots.filter(
      (p) =>
        (allowed === null || allowed.includes(p.nursery_name)) &&
        (!nursery || p.nursery_name === nursery) &&
        (!q || (p.plot_name || '').toLowerCase().includes(q))
    );
  }, [plots, allowed, nursery, query]);

  const nurseryOptions = useMemo(() => {
    const set = new Set(
      plots
        .map((p) => p.nursery_name)
        .filter((n) => n && (allowed === null || allowed.includes(n)))
    );
    return [...set].sort();
  }, [plots, allowed]);

  const today = todayStr();

  async function handleSave(stageId, date, remark) {
    const stage = stages.find((s) => String(s.id) === String(stageId));
    if (!stage || !editing) return;
    try {
      await saveStatusEntry({
        plot: editing,
        stage,
        date,
        remark,
        reportedBy: staffName,
      });
      flash(t('ps.savedToast', { plot: editing.plot_name }));
      setEditing(null);
      reload();
    } catch (e) {
      flash(t('ps.saveErr', { msg: e.message || String(e) }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title={t('ps.title')} subtitle="FC Portal" user={staffName} back="/dashboard" />
      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Filters */}
        <div className="flex gap-2">
          {nurseryOptions.length > 1 && (
            <select
              value={nursery}
              onChange={(e) => setNursery(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="">{t('ps.allNurseries')}</option>
              {nurseryOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ps.searchPlot')}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
            {t('ps.loadErr', { msg: error })}
          </div>
        )}
        {!loading && !stages.length && !error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-bold">
            {t('ps.noStages')}
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-16 animate-pulse">
            {t('common.loading')}
          </div>
        ) : visiblePlots.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {visiblePlots.map((p) => {
              const cur = currentStatus(entriesByPlot[p.plot_name]);
              const stage =
                cur &&
                (stages.find((s) => s.id === cur.stage_id) ||
                  stages.find((s) => s.name === cur.stage_name));
              const ideal = stage && stage.ideal_days != null ? Number(stage.ideal_days) : null;
              const over = cur && ideal != null && cur.days > ideal;
              const doneToday = cur && cur.last_date === today;
              return (
                <div
                  key={p.plot_name}
                  className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-slate-800 text-[15px] leading-tight truncate">
                        📍 {p.plot_name}
                      </div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        {p.nursery_name || '—'}
                      </div>
                    </div>
                    {doneToday && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-1">
                        ✓ {t('ps.today')}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 min-h-[38px]">
                    {cur ? (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                            over
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                          }`}
                        >
                          🚦 {cur.stage_name}
                        </span>
                        <div className={`text-[11px] font-bold mt-1 ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                          {t('ps.dayLine', {
                            n: cur.days,
                            ideal: ideal != null ? t('ps.ofIdeal', { d: ideal }) : '',
                          })}
                          {cur.last_by ? ` · ${cur.last_by}` : ''}
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] font-bold text-slate-400 italic">{t('ps.noStatus')}</div>
                    )}
                  </div>

                  <button
                    onClick={() => setEditing(p)}
                    disabled={!stages.length}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[11px] uppercase tracking-widest rounded-xl py-2.5 transition-colors"
                  >
                    {t('ps.updateStatus')}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-400 text-sm font-bold py-16">
            {allowed !== null && allowed.length === 0 ? t('ps.noNurseryAccess') : t('ps.noPlots')}
          </div>
        )}
      </div>

      {editing && (
        <EntrySheet
          plot={editing}
          stages={stages}
          current={currentStatus(entriesByPlot[editing.plot_name])}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          t={t}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// Bottom sheet to key in / correct today's status for one plot.
function EntrySheet({ plot, stages, current, onClose, onSave, t }) {
  const [stageId, setStageId] = useState(() => {
    if (current) {
      const s =
        stages.find((x) => x.id === current.stage_id) ||
        stages.find((x) => x.name === current.stage_name);
      if (s) return String(s.id);
    }
    return stages.length ? String(stages[0].id) : '';
  });
  const [date, setDate] = useState(todayStr());
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-800 text-[15px] uppercase tracking-wide">
            📍 {plot.plot_name}
            <span className="block text-[10px] text-slate-400 tracking-widest">{plot.nursery_name || ''}</span>
          </h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl">
            ×
          </button>
        </div>

        {current && (
          <div className="text-[12px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
            {t('ps.currentStatus')}: <strong>{current.stage_name}</strong> ·{' '}
            {t('ps.dayLine', { n: current.days, ideal: '' })}
          </div>
        )}

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('ps.stage')}
        </label>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 mb-3"
        >
          {stages.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {s.name}
              {s.ideal_days != null ? ` (${t('ps.idealShort', { d: s.ideal_days })})` : ''}
            </option>
          ))}
        </select>

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('ps.statusDate')}
        </label>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 mb-3"
        />

        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {t('ps.remark')}
        </label>
        <textarea
          rows={2}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500 mb-4"
        />

        <button
          onClick={async () => {
            setSaving(true);
            await onSave(stageId, date, remark.trim());
            setSaving(false);
          }}
          disabled={saving || !stageId || !date}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 transition-colors"
        >
          {saving ? t('auth.processing') : t('ps.saveStatus')}
        </button>
      </div>
    </div>
  );
}
