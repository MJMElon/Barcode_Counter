import { useEffect, useMemo, useState } from 'react';
import {
  cullingRate,
  fmtNum,
  fmtPct,
  getSessionData,
  hasFigures,
  refreshFigures,
} from './cullingData.js';
import { CULL_LIMIT, actionFor, caseBody } from './cullingActions.js';
import { cullingScopePlots, todayStr } from './data.js';
import { raiseCase } from '../../lib/nelos.js';

/**
 * The Culling Calculator.
 *
 * A calculator, deliberately: one plot at a time, a keypad, and a running
 * sum. Counting pokok inang is done walking the plot in several goes — "300
 * here, 250 there" — so the entry has to add up as you go rather than make
 * somebody total it on paper first and key in one number.
 *
 * Nothing here writes to stock. What the Field Conductor counts feeds the
 * rate and goes into a Nelos case, and the case is the record — so the
 * figures behind a decision are readable by whoever picks the work up,
 * without any of it moving a seedling in the ledger.
 *
 * The case is also the whole handoff. There is no second entry step for the
 * Site Auditor here: the auditor does the work and closes the case in Nelos,
 * rather than doing it, closing it, and coming back to key the same result
 * into this screen as well.
 */
export default function CullingTab({ t, staffName, userId, flash, nurseryKeys }) {
  const data = useMemo(() => getSessionData(), []);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  // Every plot the FC may see that PALMS says is at Pengambilan. No nursery
  // picker: which nurseries a person works is on their user access now, so
  // asking them again on this screen was asking a question already answered.
  const scope = useMemo(() => cullingScopePlots(), []);
  const plots = useMemo(() => {
    const out = [];
    nurseryKeys.forEach((nk) => (data[nk] || []).forEach((r) => {
      if (scope.has(r.plot)) out.push({ ...r, nursery: nk });
    }));
    return out;
  }, [data, nurseryKeys, scope]);

  const [plotId, setPlotId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [terms, setTerms] = useState([]);      // the counts already entered
  const [typing, setTyping] = useState('');    // the one being keyed now
  const [busy, setBusy] = useState(false);

  // Figures come off the Seedling Stock ledger. Best effort: with no signal
  // the calculator still runs on whatever was cached last time.
  useEffect(() => { refreshFigures().then((ok) => ok && refresh()); }, []);

  const row = plots.find((p) => p.plot === plotId) || plots[0] || null;
  useEffect(() => { if (!plotId && row) setPlotId(row.plot); }, [row, plotId]);

  const known = hasFigures(row);
  const inang = terms.reduce((a, b) => a + b, 0) + (typing === '' ? 0 : Number(typing));
  const rateNow = known ? cullingRate(row.balance, 0, 0, row.transplant) : NaN;
  const rateAfter = known ? cullingRate(row.balance, inang, 0, row.transplant) : NaN;
  const left = known ? row.balance - inang : 0;
  const action = known && inang > 0 ? actionFor(rateAfter) : null;

  const press = (k) => {
    if (k === 'AC') { setTerms([]); setTyping(''); return; }
    if (k === 'DEL') { setTyping((s) => s.slice(0, -1)); return; }
    if (k === '+') {
      if (typing !== '') { setTerms((ts) => [...ts, Number(typing)]); setTyping(''); }
      return;
    }
    if (k === '=') {
      // Fold what is being typed into the list. The total is the same either
      // way — this just makes "10 + 15 + 16 =" settle into one figure the
      // way a calculator does.
      if (typing !== '') { setTerms((ts) => [...ts, Number(typing)]); setTyping(''); }
      return;
    }
    // A count cannot start with a zero, and nothing sane needs seven digits.
    setTyping((s) => (s === '' && k === '0' ? '' : (s + k).slice(0, 6)));
  };

  async function raise() {
    if (!action || !row || busy) return;
    setBusy(true);
    const title = `${t(action.titleKey)} — ${row.plot}`;
    const { data: c, error, deduped } = await raiseCase({
      title,
      description: caseBody({
        t, plot: row.plot, nursery: row.nursery, balance: row.balance,
        inang, rate: rateAfter, terms, by: staffName, date: todayStr(),
      }),
      category: action.category,
      priority: action.priority,
      source: 'fc_portal',
      nursery: row.nursery,
      plot: row.plot,
      by: staffName,
      byId: userId,
      // Pressed twice, or the same plot revisited while the first case is
      // still open, must not queue a second identical job for the auditor.
      dedupe: true,
    });
    setBusy(false);
    if (error) { flash(t('cull.raiseFailed')); return; }
    flash(deduped ? t('cull.alreadyOpen', { n: c.case_no || '' }) : t('cull.raised', { n: c.case_no || '' }));
    setTerms([]); setTyping('');
  }

  if (!plots.length) {
    return (
      <div className="bg-[#111821] border border-[#1f2a38] text-slate-400 rounded-3xl px-4 py-10 text-center text-sm font-bold">
        {t('cull.noPlots')}
      </div>
    );
  }

  return (
    <div className="max-w-[420px] mx-auto">
      <div className="bg-black rounded-[2rem] overflow-hidden shadow-2xl border border-[#1f2a38]">
        {/* The status line: which plot, and where its rate stands before any
            of today's counting. Apple puts the clock here; the plot is what
            this calculator is always about, so it takes that place. */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-white font-black text-[15px] cursor-pointer"
          >
            {row ? row.plot : '—'}
            <span className="text-[10px] text-slate-500">▼</span>
          </button>
          <div className={`text-[13px] font-black tabular-nums ${known && rateNow > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'}`}>
            {known ? fmtPct(rateNow) : '—'}
          </div>
        </div>

        {/* The sum, read bottom-up like a calculator: what is standing, what
            has been counted off it, what that leaves. */}
        <div className="px-5 pt-6 pb-4 text-right">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            {t('cull.balance')}
          </div>
          <div className="text-slate-400 text-[22px] font-light tabular-nums leading-tight">
            {known ? fmtNum(row.balance) : '—'} <span className="text-slate-600">−</span>
          </div>

          <div className="text-slate-500 text-[13px] font-mono min-h-[18px] truncate">
            {[...terms, ...(typing === '' ? [] : [typing])].join(' + ') || ' '}
          </div>

          <div className="text-white text-[46px] font-light tabular-nums leading-none mt-1 truncate">
            {known ? fmtNum(left) : '—'}
          </div>

          <div className="mt-2 text-[12px] font-black tabular-nums">
            <span className="text-slate-500 uppercase tracking-widest text-[10px] mr-2">
              {t('cull.estRate')}
            </span>
            <span className={!known || !inang ? 'text-slate-600' : rateAfter > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'}>
              {known && inang ? fmtPct(rateAfter) : '—'}
            </span>
          </div>
        </div>

        <Keypad onPress={press} />

        {/* What the count means, and the one button that acts on it. The
            wording comes from the rule that matched, so a new band added to
            cullingActions.js appears here with nothing changed. */}
        <div className="px-4 pb-5 pt-1">
          <button
            onClick={raise}
            disabled={!action || busy}
            className={`w-full rounded-2xl py-4 font-black text-[13px] uppercase tracking-widest transition-colors ${
              !action
                ? 'bg-[#1c1c1e] text-slate-600 cursor-default'
                : action.tone === 'ok'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                : 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer'
            }`}
          >
            {busy ? t('common.saving') : action ? t(action.titleKey) : t('cull.enterCount')}
          </button>
        </div>
      </div>

      {picking && (
        <PlotPicker
          plots={plots}
          current={plotId}
          t={t}
          onPick={(p) => { setPlotId(p); setTerms([]); setTyping(''); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/* The keypad. Digits fill the left, the two things you can do to a running
   count sit in the orange column on the right, the way a calculator puts its
   operators. There is no ×, ÷ or −: you are only ever adding up counts. */
function Keypad({ onPress }) {
  const grey = 'bg-[#333336] hover:bg-[#4a4a4d] text-white';
  const dark = 'bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white';
  const amber = 'bg-amber-500 hover:bg-amber-400 text-white';
  const key = (label, k, cls, span) => (
    <button
      key={k}
      onClick={() => onPress(k)}
      className={`${cls} ${span || ''} h-[58px] rounded-full text-[22px] font-medium tabular-nums transition-colors cursor-pointer active:scale-95`}
    >
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-4 gap-2 px-4 pb-3">
      {key('AC', 'AC', grey)}
      {key('⌫', 'DEL', grey)}
      {key('', 'noop', 'bg-transparent cursor-default pointer-events-none')}
      {key('+', '+', amber)}
      {['7', '8', '9'].map((d) => key(d, d, dark))}
      {key('', 'noop2', 'bg-transparent cursor-default pointer-events-none')}
      {['4', '5', '6'].map((d) => key(d, d, dark))}
      {key('', 'noop3', 'bg-transparent cursor-default pointer-events-none')}
      {['1', '2', '3'].map((d) => key(d, d, dark))}
      {key('=', '=', amber, 'row-span-2')}
      {key('0', '0', dark, 'col-span-2')}
      {key('00', '00', dark)}
    </div>
  );
}

/* Which plot. Every plot at Pengambilan that this person may see, with the
   rate it stands at, so the choice is made on the figures rather than by
   remembering plot numbers. */
function PlotPicker({ plots, current, t, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111821] border border-[#1f2a38] w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-100 text-[14px] uppercase tracking-wide">{t('cull.pickPlot')}</h3>
          <button onClick={onClose} aria-label={t('common.cancel')}
            className="w-8 h-8 rounded-full hover:bg-[#1f2a38] text-slate-400 text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="space-y-1.5">
          {plots.map((p) => {
            const known = hasFigures(p);
            const rate = known ? cullingRate(p.balance, 0, 0, p.transplant) : NaN;
            return (
              <button
                key={p.plot}
                onClick={() => onPick(p.plot)}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left cursor-pointer border transition-colors ${
                  p.plot === current
                    ? 'bg-emerald-600/15 border-emerald-600/50'
                    : 'bg-[#0f1620] border-[#1f2a38] hover:border-slate-600'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-black text-slate-100 text-[14px]">{p.plot}</div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {p.nursery} · {t('cull.balance')} {known ? fmtNum(p.balance) : '—'}
                  </div>
                </div>
                <div className={`text-[13px] font-black tabular-nums shrink-0 ${
                  !known ? 'text-slate-600' : rate > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {known ? fmtPct(rate) : '—'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
