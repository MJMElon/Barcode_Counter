import { useEffect, useMemo, useState } from 'react';
import PlotAreaEditor from './PlotAreaEditor.jsx';
import { fetchPlotMaps, loadCachedMaps, weightsFromDividers } from './plotMaps.js';
import {
  ACTIVITIES,
  NURSERIES,
  activityByN,
  applySettings,
  areaMapUrl,
  plotsOf,
} from './data.js';
import { AREA_LETTERS, defaultSettings, loadSettings, saveSettings } from './settings.js';

// Settings — the two things that used to need a code change: how a plot is
// divided into areas, and when a plot starts needing attention.
export default function SettingsTab({ t, flash }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const allPlots = useMemo(
    () => Object.keys(NURSERIES).flatMap((nk) => plotsOf(nk).map((p) => ({ plot: p, nursery: nk }))),
    []
  );
  const [plot, setPlot] = useState(allPlots[0].plot);

  // Plot outlines and the nursery aerial maps come from the main portal's
  // Nursery Operation Management, so a plot drawn there is the plot shown
  // here rather than a second, drifting copy.
  const [maps, setMaps] = useState(() => loadCachedMaps());
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [mapErr, setMapErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoadingMaps(true);
    fetchPlotMaps()
      .then((m) => alive && setMaps(m))
      .catch((e) => alive && setMapErr(e.message || String(e)))
      .finally(() => alive && setLoadingMaps(false));
    return () => {
      alive = false;
    };
  }, []);

  const cfg = settings.multi[plot];
  const [count, setCount] = useState(cfg ? cfg.areas.length : 1);
  const [dividers, setDividers] = useState(() => (cfg && cfg.dividers ? cfg.dividers : []));
  const [cap, setCap] = useState(cfg ? cfg.cap : '');

  function selectPlot(p) {
    const c = settings.multi[p];
    setPlot(p);
    setCount(c ? c.areas.length : 1);
    setDividers(c && c.dividers ? c.dividers : []);
    setCap(c ? c.cap : '');
  }

  const areas = AREA_LETTERS.slice(0, count);
  const plotMap = maps && maps.plots ? maps.plots[plot] : null;
  const poly = plotMap ? plotMap.poly : null;
  const nurseryOfSel = plotMap ? plotMap.nursery : allPlots.find((x) => x.plot === plot).nursery;
  const mapUrl = maps && maps.nurseries ? maps.nurseries[nurseryOfSel] : null;
  const ready = count < 2 || dividers.length === count - 1;
  const weights = ready && count > 1 ? weightsFromDividers(areas, dividers, poly) : null;

  function changeCount(n) {
    setCount(n);
    setDividers((d) => d.slice(0, Math.max(0, n - 1)));
  }

  function savePlot() {
    if (count > 1 && !ready) {
      flash(t('set.drawFirst'));
      return;
    }
    const next = { ...settings, multi: { ...settings.multi } };
    if (count <= 1) {
      delete next.multi[plot];
    } else {
      next.multi[plot] = {
        areas: [...areas],
        weights,
        dividers,
        cap: cap.trim(),
      };
    }
    if (!saveSettings(next)) {
      flash(t('set.saveFull'));
      return;
    }
    applySettings(next);
    setSettings(next);
    flash(t('set.savedPlot', { p: plot }));
  }

  /* ---- needs attention ---- */
  const rules = Object.entries(settings.attention).map(([n, d]) => ({ n: Number(n), d }));

  function commitRules(list) {
    const attention = {};
    list.forEach((r) => {
      if (r.n && r.d !== '' && Number(r.d) > 0) attention[r.n] = Number(r.d);
    });
    const next = { ...settings, attention };
    if (!saveSettings(next)) {
      flash(t('set.saveFull'));
      return;
    }
    applySettings(next);
    setSettings(next);
  }

  function setRule(i, field, v) {
    const list = rules.map((r, idx) => (idx === i ? { ...r, [field]: v } : r));
    commitRules(list);
  }
  function addRule() {
    const unused = ACTIVITIES.find((a) => settings.attention[a.n] == null);
    if (!unused) return;
    commitRules([...rules, { n: unused.n, d: 7 }]);
  }
  function removeRule(i) {
    commitRules(rules.filter((_, idx) => idx !== i));
  }

  function resetAll() {
    const d = defaultSettings();
    saveSettings(d);
    applySettings(d);
    setSettings(d);
    selectPlot(plot);
    flash(t('set.reset'));
  }

  const splitPlots = Object.keys(settings.multi);

  return (
    <>
      {/* ---------------- plot areas ---------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('set.areasTitle')}</h3>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{t('set.areasLead')}</p>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Plot
              <select
                value={plot}
                onChange={(e) => selectPlot(e.target.value)}
                className="mt-1 block bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
              >
                {Object.keys(NURSERIES).map((nk) => (
                  <optgroup key={nk} label={NURSERIES[nk].label}>
                    {plotsOf(nk).map((p) => (
                      <option key={p} value={p}>
                        {p}
                        {settings.multi[p] ? ` — ${settings.multi[p].areas.length} ${t('set.areasWord')}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {t('set.areaCount')}
              <select
                value={count}
                onChange={(e) => changeCount(Number(e.target.value))}
                className="mt-1 block bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? t('set.oneArea') : n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mapErr && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-[12px] font-bold">
              {t('set.mapErr', { msg: mapErr })}
            </div>
          )}

          {count > 1 && (
            <>
              {mapUrl ? (
                <PlotAreaEditor
                  key={`${plot}-${count}`}
                  mapUrl={mapUrl}
                  poly={poly}
                  areas={areas}
                  dividers={dividers}
                  onChange={setDividers}
                  t={t}
                />
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-6 text-center text-[12px] font-bold text-slate-400">
                  {loadingMaps ? t('common.loading') : t('set.noMap', { n: nurseryOfSel })}
                </div>
              )}

              {weights && (
                <div className="flex gap-2 flex-wrap">
                  {areas.map((a) => (
                    <span
                      key={a}
                      className="text-[12px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1"
                    >
                      {a} · {weights[a]}%
                    </span>
                  ))}
                  <span className="text-[11px] font-semibold text-slate-400 self-center">{t('set.measured')}</span>
                </div>
              )}

              <div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  {t('set.caption')}
                </div>
                <textarea
                  rows={2}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}

          <button
            onClick={savePlot}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[12px] uppercase tracking-widest rounded-xl px-6 py-3 cursor-pointer"
          >
            {count <= 1 ? t('set.saveSingle', { p: plot }) : t('set.savePlot', { p: plot })}
          </button>

          {splitPlots.length > 0 && (
            <div className="text-[11px] font-bold text-slate-400">
              {t('set.currentlySplit')}{' '}
              {splitPlots.map((p) => (
                <button
                  key={p}
                  onClick={() => selectPlot(p)}
                  className="text-emerald-600 hover:underline cursor-pointer mr-1.5"
                >
                  {p}({settings.multi[p].areas.length})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- needs attention ---------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('set.attnTitle')}</h3>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{t('set.attnLead')}</p>
        </div>
        <div className="px-4 py-3 space-y-2">
          {rules.length === 0 && (
            <div className="text-[12px] font-semibold text-slate-400">{t('set.attnEmpty')}</div>
          )}
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <select
                value={r.n}
                onChange={(e) => setRule(i, 'n', Number(e.target.value))}
                className="flex-1 min-w-[150px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
              >
                {ACTIVITIES.map((a) => (
                  <option key={a.n} value={a.n}>
                    {a.n}. {a.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] font-bold text-slate-500">{t('set.warnUnder')}</span>
              <input
                type="number"
                min="1"
                value={r.d}
                onChange={(e) => setRule(i, 'd', e.target.value)}
                className="w-20 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] font-bold text-slate-500">{t('set.daysWord')}</span>
              <button
                onClick={() => removeRule(i)}
                className="text-rose-500 hover:text-rose-700 font-black text-lg px-2 cursor-pointer"
                aria-label={t('set.removeRule')}
                title={t('set.removeRule')}
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={addRule}
              className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-[11px] font-black uppercase tracking-wider rounded-lg px-3 py-2 cursor-pointer"
            >
              + {t('set.addRule')}
            </button>
            <span className="text-[11px] font-semibold text-slate-400">
              {t('set.attnNote', {
                list: rules.length
                  ? rules.map((r) => `${activityByN(r.n) ? activityByN(r.n).name : r.n} < ${r.d}d`).join(', ')
                  : '—',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="text-center">
        <button onClick={resetAll} className="text-[11px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer">
          {t('set.resetAll')}
        </button>
      </div>
    </>
  );
}
