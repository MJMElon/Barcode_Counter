import { useMemo, useState } from 'react';
import {
  ACTIVITIES,
  NURSERIES,
  activityByN,
  applySettings,
  areaMapUrl,
  plotsOf,
} from './data.js';
import {
  AREA_LETTERS,
  bandsFromWeights,
  defaultSettings,
  loadSettings,
  readImageScaled,
  saveSettings,
} from './settings.js';

// Settings — the two things that used to need a code change: how a plot is
// divided into areas, and when a plot starts needing attention.
export default function SettingsTab({ t, flash }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const allPlots = useMemo(
    () => Object.keys(NURSERIES).flatMap((nk) => plotsOf(nk).map((p) => ({ plot: p, nursery: nk }))),
    []
  );
  const [plot, setPlot] = useState(allPlots[0].plot);

  // Working copy of the selected plot's split. One area means "not split".
  const cfg = settings.multi[plot];
  const [count, setCount] = useState(cfg ? cfg.areas.length : 1);
  const [weights, setWeights] = useState(() => (cfg ? { ...cfg.weights } : { A: 100 }));
  const [bands, setBands] = useState(() => (cfg ? { ...cfg.band } : null));
  const [cap, setCap] = useState(cfg ? cfg.cap : '');
  const [photo, setPhoto] = useState(settings.photos[plot] || null);
  const [busy, setBusy] = useState(false);

  function selectPlot(p) {
    const c = settings.multi[p];
    setPlot(p);
    setCount(c ? c.areas.length : 1);
    setWeights(c ? { ...c.weights } : { A: 100 });
    setBands(c ? { ...c.band } : null);
    setCap(c ? c.cap : '');
    setPhoto(settings.photos[p] || null);
  }

  const areas = AREA_LETTERS.slice(0, count);
  const total = areas.reduce((s, a) => s + (Number(weights[a]) || 0), 0);
  const balanced = total === 100;

  function changeCount(n) {
    setCount(n);
    const next = {};
    AREA_LETTERS.slice(0, n).forEach((a, i) => {
      // Spread evenly, giving any remainder to the last area.
      next[a] = i === n - 1 ? 100 - Math.floor(100 / n) * (n - 1) : Math.floor(100 / n);
    });
    setWeights(next);
    setBands(null); // recomputed from the shares on save unless edited
  }

  function setWeight(a, v) {
    setWeights((w) => ({ ...w, [a]: v === '' ? '' : Math.max(0, Math.min(100, Number(v))) }));
    setBands(null);
  }

  const effectiveBands = bands || bandsFromWeights(areas, weights);

  function setSplit(i, v) {
    // Split i is the boundary between area i and i+1, as a % of the photo.
    const val = Math.max(1, Math.min(99, Number(v) || 0));
    const next = {};
    const points = areas.slice(0, -1).map((a, idx) => (idx === i ? val : effectiveBands[areas[idx]][1]));
    points.sort((x, y) => x - y);
    areas.forEach((a, idx) => {
      next[a] = [idx === 0 ? 0 : points[idx - 1], idx === areas.length - 1 ? 100 : points[idx]];
    });
    setBands(next);
  }

  async function pickPhoto(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true);
    try {
      setPhoto(await readImageScaled(f));
    } catch (err) {
      flash(t('set.photoErr'));
    }
    setBusy(false);
  }

  function savePlot() {
    if (count > 1 && !balanced) {
      flash(t('set.mustTotal'));
      return;
    }
    const next = { ...settings, multi: { ...settings.multi }, photos: { ...settings.photos } };
    if (count <= 1) {
      delete next.multi[plot];
      delete next.photos[plot];
    } else {
      const w = {};
      areas.forEach((a) => (w[a] = Number(weights[a]) || 0));
      next.multi[plot] = { areas: [...areas], weights: w, band: effectiveBands, cap: cap.trim() };
      if (photo) next.photos[plot] = photo;
      else delete next.photos[plot];
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

          {count > 1 && (
            <>
              {/* share of the plot per area */}
              <div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  {t('set.share')}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {areas.map((a) => (
                    <label key={a} className="flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
                      {a}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={weights[a] ?? ''}
                        onChange={(e) => setWeight(a, e.target.value)}
                        className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-bold tabular-nums outline-none focus:border-emerald-500"
                      />
                      %
                    </label>
                  ))}
                  <span
                    className={`text-[11px] font-black self-center ${
                      balanced ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    = {total}%
                  </span>
                </div>
              </div>

              {/* photo + where each area sits on it */}
              <div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  {t('set.photo')}
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-200">
                  <img src={photo || areaMapUrl(plot)} alt={plot} className="w-full block" />
                  {areas.map((a) => {
                    const [l, r] = effectiveBands[a];
                    return (
                      <div
                        key={a}
                        style={{ left: `${l}%`, width: `${r - l}%` }}
                        className="absolute inset-y-0 grid place-items-center ring-1 ring-inset ring-white/70"
                      >
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-black bg-white/90 text-slate-800">
                          {a}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <label className="mt-2 inline-block bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-[11px] font-black uppercase tracking-wider rounded-lg px-3 py-2 cursor-pointer">
                  {busy ? t('set.reading') : t('set.uploadPhoto')}
                  <input type="file" accept="image/*" onChange={pickPhoto} hidden />
                </label>

                {areas.length > 1 && (
                  <div className="mt-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      {t('set.splits')}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {areas.slice(0, -1).map((a, i) => (
                        <label key={a} className="flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
                          {a}|{areas[i + 1]}
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={effectiveBands[a][1]}
                            onChange={(e) => setSplit(i, e.target.value)}
                            className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-bold tabular-nums outline-none focus:border-emerald-500"
                          />
                          %
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
