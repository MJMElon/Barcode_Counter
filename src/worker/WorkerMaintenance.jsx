import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { WORK_TYPES, workTypeLabel, workTypeByKey, todayStr } from '../modules/maintenance/helpers.js';
import { useWorker } from './WorkerAuthContext.jsx';
import * as api from './workerApi.js';
import WorkerNav from './WorkerNav.jsx';

/*
 * A worker records the job they have just done.
 *
 * The same four work types as the FC Portal's Maintenance module, writing the
 * same nops_maint_field_records table, so the office adds a worker's morning
 * and a Field Conductor's morning up once rather than reconciling two lists.
 *
 * What this is NOT is the FC module with a different hat on. That screen is a
 * conductor's: a week timeline, the office schedule, everybody's records,
 * editing and deleting. A worker needs one question answered — what did you
 * do, where — and a list of their own jobs so they can see it went in.
 *
 * No photographs. The documents bucket takes uploads from `authenticated`
 * only (shared/migration_documents_bucket.sql) and a worker signed in with a
 * PIN is `anon`, so a camera button here would fail every time it was
 * pressed. It is left out rather than left broken.
 */
export default function WorkerMaintenance() {
  const { t, lang } = useLang();
  const { token } = useWorker();

  const [plots, setPlots] = useState([]);
  const [batches, setBatches] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);

  const [plot, setPlot] = useState('');
  const [workType, setWorkType] = useState('');
  const [date, setDate] = useState(todayStr());
  const [qty, setQty] = useState('');
  const [chemical, setChemical] = useState('');
  const [batch, setBatch] = useState('');
  const [remark, setRemark] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind, text }

  useEffect(() => {
    let alive = true;
    Promise.all([api.plots(token), api.plotBatches(token), api.myRecords(token, 40)])
      .then(([p, b, r]) => {
        if (!alive) return;
        setPlots(p);
        setBatches(b);
        setRecords(r);
        setLoadErr(null);
      })
      .catch((e) => alive && setLoadErr((e && e.message) || 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  /* The batches standing in the chosen plot, so the worker ticks one rather
     than typing a batch number into a phone in the sun. */
  const plotBatchList = useMemo(() => {
    if (!plot) return [];
    const key = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    return batches.filter((b) => key(b.plot_name) === key(plot));
  }, [plot, batches]);

  useEffect(() => {
    // A batch picked for the last plot means nothing in this one.
    setBatch('');
  }, [plot]);

  const chemicalNeeded = workType === 'pd' || workType === 'interrow';

  async function handleSubmit() {
    if (!plot) return setMsg({ kind: 'error', text: t('wk.pickPlot') });
    if (!workType) return setMsg({ kind: 'error', text: t('wk.pickWork') });
    setBusy(true);
    setMsg(null);
    try {
      const wt = workTypeByKey(workType);
      await api.submitMaintenance(token, {
        plot_name: plot,
        work_type: workType,
        jenis: wt ? wt.jenis : null,
        work_date: date,
        qty: qty === '' ? null : qty,
        chemical: chemical || null,
        batch_name: batch || null,
        remark: remark || null,
      });
      setMsg({ kind: 'ok', text: t('wk.saved') });
      setQty('');
      setChemical('');
      setBatch('');
      setRemark('');
      setRecords(await api.myRecords(token, 40));
    } catch (e) {
      setMsg({ kind: 'error', text: (e && e.message) || t('wk.saveFailed') });
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-800 outline-none focus:border-emerald-600';
  const label = 'block text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] mb-1.5';

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <WorkerNav title={t('wk.maintTitle')} back="/worker" />

      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-[13px] font-semibold text-red-800">
            {loadErr}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">
            {t('common.loading')}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-4 mb-4">
              {msg && (
                <div
                  className={`rounded-xl px-3 py-2.5 mb-3.5 text-[13px] font-bold ${
                    msg.kind === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {/* What was done — big taps, not a dropdown. A worker is
                  choosing between four things while holding a phone in one
                  hand, and four buttons beat a select every time. */}
              <label className={label}>{t('wk.work')}</label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {WORK_TYPES.map((w) => (
                  <button
                    key={w.key}
                    onClick={() => setWorkType(w.key)}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                      workType === w.key
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xl shrink-0">{w.icon}</span>
                    <span className="text-[12px] font-black text-slate-700 leading-tight">
                      {workTypeLabel(w, lang)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('wk.plot')}</label>
                  <select value={plot} onChange={(e) => setPlot(e.target.value)} className={field}>
                    <option value="">{t('wk.pickPlot')}</option>
                    {plots.map((p) => (
                      <option key={p.plot_name} value={p.plot_name}>
                        {p.plot_name} — {p.nursery_name}
                      </option>
                    ))}
                  </select>
                  {plots.length === 0 && (
                    <div className="text-[11px] font-semibold text-amber-700 mt-1.5">
                      {t('wk.noPlots')}
                    </div>
                  )}
                </div>

                <div>
                  <label className={label}>{t('wk.date')}</label>
                  <input
                    type="date"
                    value={date}
                    max={todayStr()}
                    onChange={(e) => setDate(e.target.value)}
                    className={field}
                  />
                </div>

                {plotBatchList.length > 0 && (
                  <div>
                    <label className={label}>{t('wk.batch')}</label>
                    <select value={batch} onChange={(e) => setBatch(e.target.value)} className={field}>
                      <option value="">{t('wk.allBatches')}</option>
                      {plotBatchList.map((b) => (
                        <option key={b.batch_name} value={b.batch_name}>
                          {b.batch_name} ({Number(b.qty).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={label}>{t('wk.qty')}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className={field}
                    placeholder="0"
                  />
                </div>

                {chemicalNeeded && (
                  <div className="sm:col-span-2">
                    <label className={label}>{t('wk.chemical')}</label>
                    <input
                      type="text"
                      value={chemical}
                      onChange={(e) => setChemical(e.target.value)}
                      className={field}
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className={label}>{t('wk.remark')}</label>
                  <input
                    type="text"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    className={field}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={busy}
                className="w-full h-12 mt-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[13px] font-black uppercase tracking-[0.15em] transition-colors cursor-pointer"
              >
                {busy ? t('wk.saving') : t('wk.save')}
              </button>
            </div>

            {/* Their own jobs, so the morning can be seen to have gone in. */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em]">
                  {t('wk.myWork')}
                </div>
              </div>
              {records.length === 0 ? (
                <div className="px-4 py-6 text-[13px] font-semibold text-slate-400 text-center">
                  {t('wk.noneYet')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="text-xl shrink-0">
                        {(workTypeByKey(r.work_type) || {}).icon || '•'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-black text-slate-800 truncate">
                          {r.plot_name}
                          <span className="font-bold text-slate-400"> · </span>
                          <span className="font-bold text-slate-600">
                            {workTypeLabel(workTypeByKey(r.work_type), lang) || r.work_type}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {r.work_date}
                          {r.remark ? ` · ${r.remark}` : ''}
                        </div>
                      </div>
                      {r.qty != null && (
                        <div className="text-[13px] font-black text-slate-700 shrink-0 tabular-nums">
                          {Number(r.qty).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
