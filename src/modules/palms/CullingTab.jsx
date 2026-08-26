import { useEffect, useMemo, useState } from 'react';
import { fmtNum, fmtPct } from './cullingData.js';
import { CULL_LIMIT, actionFor, caseBody } from './cullingActions.js';
// Every figure on this screen comes from here.
import {
  diagnose, figuresBroken, figuresFor, hasFigures, loadPlots, plantedNear, rateFor,
} from './cullingSource.js';
import { prettyD, todayStr } from './data.js';
import { openCasePlots, raiseCase } from '../../lib/nelos.js';

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
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  /* The plots to list, and the figures behind each — both from
     cullingSource.js, which only ever hands over blocks it has figures for.
     A collection against a batch that was never transplanted into that plot
     is left out at the source, so there is no "cannot say" row to render:
     every plot here has a transplanted-in figure, a collected figure and a
     balance between them. */
  const [rows, setRows] = useState([]);
  const plots = useMemo(
    () =>
      rows
        /* Only the nurseries this person works. Which ones those are comes
           from FC Portal user access, and the list lost that filter when the
           delivery orders replaced the old plot source — a BNN-only Field
           Conductor was being offered UNN blocks. */
        .filter((r) => !r.nursery || !nurseryKeys?.length || nurseryKeys.includes(r.nursery))
        .map((r) => ({ ...r, ...figuresFor(r) })),
    [rows, tick, nurseryKeys]
  );

  /* Plots that already have an open case. Read once and refreshed after a
     case is raised, so the picker can say "this one has been sent" instead
     of leaving somebody to find out by pressing the button and being told
     it was a duplicate. */
  const [raised, setRaised] = useState(() => new Set());
  const reloadRaised = () =>
    openCasePlots({ source: 'scan' }).then(setRaised, () => {});

  /* What is selected. A plot on its own stopped being unique the moment its
     batches were separated: U4 batch 301 and U4 batch 302 are two blocks of
     ground, collected on their own timetables. */
  const [plotId, setPlotId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [terms, setTerms] = useState([]);      // the counts already entered
  const [typing, setTyping] = useState('');    // the one being keyed now
  const [busy, setBusy] = useState(false);

  // Best effort: a read that fails leaves the screen empty rather than broken.
  useEffect(() => {
    let live = true;
    loadPlots().then((p) => { if (live) { setRows(p || []); refresh(); } }, () => {});
    openCasePlots({ source: 'scan' }).then((s) => { if (live) setRaised(s); }, () => {});
    /* A plot that ought to be on this list and is not has been stopped by one
       of the rules behind it, and the screen cannot say which — it simply
       does not have the row. So the answer is put within reach: with the
       calculator open, cullDebug('B4') or cullDebug('U17', '237') in the
       browser console prints every collection line and the rule it fell at. */
    window.cullDebug = async (plot, batch) => {
      const lines = await diagnose(plot, batch);
      console.log('%cdelivery order lines', 'font-weight:bold');
      console.table(lines);
      if (plot) {
        console.log('%cwhat the batch report holds', 'font-weight:bold');
        console.table(await plantedNear(plot, batch));
      }
      return lines;
    };
    return () => { live = false; };
  }, []);

  const plotRow = plots.find((p) => p.key === plotId) || plots[0] || null;
  useEffect(() => { if (!plotId && plotRow) setPlotId(plotRow.key); }, [plotRow, plotId]);
  /* A count belongs to the block it was walked in, so moving to another one
     clears it rather than quietly re-attributing it. */
  useEffect(() => { setTerms([]); setTyping(''); }, [plotId]);

  /* The row the whole screen works from — one object, so the rate, the action
     and the case cannot read different figures. It is already one block: a
     plot and a batch, chosen as a pair. */
  const row = plotRow;

  const known = hasFigures(row);
  const broken = figuresBroken(row);
  const inang = terms.reduce((a, b) => a + b, 0) + (typing === '' ? 0 : Number(typing));
  const rateNow = rateFor({ balance: row?.balance, transplant: row?.transplant, inang: 0 });
  const rateAfter = rateFor({ balance: row?.balance, transplant: row?.transplant, inang });
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
    // The case's own sentence, not the button's label: see caseTitle in
    // cullingActions.js for why it does not follow the language picker.
    const title = action.caseTitle(row.plot);
    const { data: c, error, deduped } = await raiseCase({
      title,
      description: caseBody({
        t, plot: row.plot, nursery: row.nursery, balance: row.balance,
        inang, rate: rateAfter, terms, by: staffName, date: todayStr(),
        // Which block of the plot was walked. Without it the auditor is sent
        // to a plot and left to work out which part of it was counted.
        batch: row.batch,
      }),
      category: action.category,
      priority: action.priority,
      source: 'scan',            // the FC Portal's key in nelos_modules
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
    reloadRaised();
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
      <div className="bg-black rounded-[2rem] overflow-hidden shadow-2xl border border-[#1f2a38] p-3 space-y-2.5">
        {/* Which plot, and where its rate stands before any of today's
            counting. Apple puts the clock here; the plot is what this
            calculator is always about, so it takes that place. */}
        <div className="flex items-center justify-between px-2 pt-1">
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-white font-black text-[15px] cursor-pointer"
          >
            {row ? row.plot : '—'}
            {row && row.batch && (
              <span className="font-bold text-slate-400 text-[11px] tabular-nums">{row.batch}</span>
            )}
            <span className="text-[10px] text-slate-500">▼</span>
          </button>
          <div className="text-[13px] font-black tabular-nums">
            <span className="text-slate-500 mr-1">{t('cull.cullShort')} :</span>
            <span className={
              broken ? 'text-amber-400'
                : known && rateNow > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'
            }>
              {known ? fmtPct(rateNow) : t('cull.checkStock')}
            </span>
          </div>
        </div>

        {/* Two blocks, because there are two numbers and they are not the
            same kind of thing: what the plot is holding, and what has been
            counted off it. Told apart by a panel each rather than a rule
            between them — a hard border here made the screen busier without
            making it clearer. */}
        <div className="bg-[#101013] rounded-2xl px-4 py-3 text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('cull.balance')}
          </div>
          <div className={`text-[28px] font-light tabular-nums leading-tight ${
            broken ? 'text-amber-400' : 'text-slate-300'
          }`}>
            {fmtNum(row.balance)}
          </div>
          {/* Below zero means the stock ledger for this plot does not add up:
              more has been culled and sold off it than was ever transplanted
              in. It is a real figure and the office movement report shows it
              too, so it is named rather than hidden — but no rate is offered
              on top of it, because a rate worked out from it would be
              negative, and a negative rate reads as a healthy plot. */}
          {broken && (
            <div className="text-[10px] font-bold text-amber-500/80 leading-snug pt-0.5">
              {t('cull.negativeNote')}
            </div>
          )}
          {/* The balance in full, so nobody has to work out where the rest
              went: what the Batch Report says went in, less what the delivery
              orders have taken out. */}
          {row && (
            <div className="text-[10px] font-bold text-slate-500 tabular-nums leading-snug pt-1 space-y-0.5">
              <div className="flex justify-between gap-3">
                <span>
                  {t('cull.transplantedIn')}
                  {row.transplantedOn && (
                    <span className="text-slate-600 ml-1">{prettyD(row.transplantedOn)}</span>
                  )}
                </span>
                <span className="text-slate-400">{fmtNum(row.transplant)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{t('cull.collected')}</span>
                <span className="text-slate-400">{fmtNum(row.collected || 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#101013] rounded-2xl pt-3 pb-2">
          <div className="px-4 text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('cull.selected')}
            </div>
            <div className="text-slate-500 text-[13px] font-mono min-h-[18px] truncate">
              {[...terms, ...(typing === '' ? [] : [typing])].join(' + ') || ' '}
            </div>
            <div className="text-white text-[42px] font-light tabular-nums leading-none truncate">
              {inang ? fmtNum(inang) : '0'}
            </div>
          </div>

          {/* The keypad belongs to the count, so it sits inside its panel
              rather than floating under the whole card. */}
          <Keypad onPress={press} />
        </div>

        {/* What the count leaves, and what that means. A strip rather than a
            third panel: it is the consequence of the two above, not a number
            of its own. */}
        <div className="flex items-center justify-between px-4 py-1 text-[12px] font-black tabular-nums">
          <span>
            <span className="text-slate-500 uppercase tracking-widest text-[10px] mr-1.5">{t('cull.left')}</span>
            <span className="text-slate-300">{known ? fmtNum(left) : '—'}</span>
          </span>
          <span>
            <span className="text-slate-500 uppercase tracking-widest text-[10px] mr-1.5">{t('cull.estRate')}</span>
            <span className={!known || !inang ? 'text-slate-600' : rateAfter > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'}>
              {known && inang ? fmtPct(rateAfter) : '—'}
            </span>
          </span>
        </div>

        {/* The one button that acts on it. The wording comes from the rule
            that matched, so a new band added to cullingActions.js appears
            here with nothing changed. */}
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

      {picking && (
        <PlotPicker
          plots={plots}
          current={plotId}
          raised={raised}
          t={t}
          onPick={(p) => { setPlotId(p); setTerms([]); setTyping(''); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/* The keypad.
   Digits fill the left; the two things you can do to a running count sit in
   the orange column, + above =. Both are two rows tall — + reaching from the
   9 down to the 6 and = from the 3 down to the 00 — so the column is two
   even halves rather than one small key and one long one. There is no ×, ÷
   or −: you are only ever adding up counts. */
function Keypad({ onPress }) {
  const grey = 'bg-[#333336] hover:bg-[#4a4a4d] text-white';
  const dark = 'bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white';
  const amber = 'bg-amber-500 hover:bg-amber-400 text-white';
  const key = (label, k, cls, span) => (
    <button
      key={k}
      onClick={() => onPress(k)}
      className={`${cls} ${span || ''} rounded-2xl text-[22px] font-medium tabular-nums transition-colors cursor-pointer active:scale-95`}
    >
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-4 grid-rows-5 gap-2 px-3 pb-1 pt-2 auto-rows-[54px] [&>button]:h-[54px]">
      {key('AC', 'AC', grey, 'col-span-2')}
      {key('⌫', 'DEL', grey, 'col-span-2')}
      {['7', '8', '9'].map((d) => key(d, d, dark))}
      {key('+', '+', amber, 'row-span-2 !h-[116px]')}
      {['4', '5', '6'].map((d) => key(d, d, dark))}
      {['1', '2', '3'].map((d) => key(d, d, dark))}
      {key('=', '=', amber, 'row-span-2 !h-[116px]')}
      {key('0', '0', dark, 'col-span-2')}
      {key('00', '00', dark)}
    </div>
  );
}

/* Which plot. Every plot at Pengambilan that this person may see, with the
   rate it stands at, so the choice is made on the figures rather than by
   remembering plot numbers. */
function PlotPicker({ plots, current, raised, t, onPick, onClose }) {
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
            const broken = figuresBroken(p);
            const rate = rateFor({ balance: p.balance, transplant: p.transplant, inang: 0 });
            return (
              <button
                key={p.key}
                onClick={() => onPick(p.key)}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left cursor-pointer border transition-colors ${
                  p.key === current
                    ? 'bg-emerald-600/15 border-emerald-600/50'
                    : 'bg-[#0f1620] border-[#1f2a38] hover:border-slate-600'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-slate-100 text-[14px]">{p.plot}</span>
                    {/* The batch, because the plot alone no longer says which
                        block this row is. */}
                    <span className="font-bold text-slate-400 text-[11px] tabular-nums">{p.batch}</span>
                    {/* Already handed over. The rate alone cannot say this,
                        and without it the only way to find out is to press
                        the button and be told it was a duplicate. */}
                    {raised && raised.has(p.plot) && (
                      <span className="rounded-md bg-emerald-600 text-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
                        ✓ Nelos
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {p.nursery} · {t('cull.balance')} {fmtNum(p.balance)}
                  </div>
                </div>
                {/* A minus balance is not a good rate, so it does not get a
                    green percentage. It gets named for what it is. */}
                {broken ? (
                  <div className="text-[9px] font-black uppercase tracking-wider text-amber-400 shrink-0 text-right leading-tight max-w-[86px]">
                    {t('cull.checkStock')}
                  </div>
                ) : (
                  <div className={`text-[13px] font-black tabular-nums shrink-0 ${
                    rate > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {fmtPct(rate)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
