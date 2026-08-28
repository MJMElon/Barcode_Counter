import { useEffect, useMemo, useState } from 'react';
import { fmtNum, fmtPct } from './cullingData.js';
import { CULL_LIMIT, actionFor, caseBody } from './cullingActions.js';
// Every figure on this screen comes from here.
import {
  diagnose, figuresBroken, figuresFor, hasFigures, loadPlots, plantedNear, rateFor,
} from './cullingSource.js';
import { todayStr } from './data.js';
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
      /* Which orders make up the figure on screen. "N15 batch 244 collected
         186 — from which D/O?" is asked of a number, and the answer is the
         orders that were counted into it, named and totalled, so the screen
         and the paperwork can be squared without adding a column up by
         hand. */
      const counted = lines.filter((l) => l.why === 'LISTED');
      if (counted.length) {
        const total = counted.reduce((n, l) => n + Math.abs(Number(l.qty || 0)), 0);
        console.log(
          `%ccollected ${total.toLocaleString()} on ${counted.length} order` +
            `${counted.length === 1 ? '' : 's'}: ` +
            counted.map((l) => `${l.do || '(no number)'} ${l.qty}`).join(', '),
          'font-weight:bold'
        );
      }
      if (plot) {
        console.log('%cwhat the batch report holds', 'font-weight:bold');
        console.table(await plantedNear(plot, batch));
      }
      return lines;
    };
    return () => { live = false; };
  }, []);

  /* One row per PLOT, with its batches underneath.
     
     The list was one row per plot AND batch, which is right for the figures —
     a batch is the block of ground actually being emptied — but wrong for
     choosing: a Field Conductor is sent to a PLOT, and being asked which of
     B4's three batches he means before he has stood in it is the wrong
     question in the wrong order. So the plot is the choice, and the batch is
     a second, optional one made beside it.

     ALL sums the batches. That is the honest whole-plot figure: transplanted
     in is what went in across all of them, collected is what has come off,
     and the balance is the difference — the same arithmetic one batch gets,
     over more ground. */
  const plotList = useMemo(() => {
    const by = new Map();
    plots.forEach((b) => {
      if (!by.has(b.plot)) {
        by.set(b.plot, {
          key: b.plot, plot: b.plot, batch: '', nursery: b.nursery,
          transplant: 0, collected: 0, balance: 0,
          firstDate: '', lastDate: '', orders: [], blocks: [],
        });
      }
      const e = by.get(b.plot);
      e.blocks.push(b);
      e.transplant += b.transplant || 0;
      e.collected += b.collected || 0;
      e.balance += b.balance || 0;
      e.orders = e.orders.concat(b.orders || []);
      if (b.firstDate && (!e.firstDate || b.firstDate < e.firstDate)) e.firstDate = b.firstDate;
      if (b.lastDate && b.lastDate > e.lastDate) e.lastDate = b.lastDate;
      // Collection on the plot opened when its FIRST batch opened.
      e.daysCollecting = Math.max(e.daysCollecting || 0, b.daysCollecting || 0);
    });
    by.forEach((e) => {
      e.orders.sort((a, b2) => String(a.on).localeCompare(String(b2.on))
        || String(a.do).localeCompare(String(b2.do)));
      e.blocks.sort((a, b2) => String(a.batch).localeCompare(String(b2.batch)));
    });
    return [...by.values()];
  }, [plots]);

  const plotRow = plotList.find((p) => p.key === plotId) || plotList[0] || null;
  useEffect(() => { if (!plotId && plotRow) setPlotId(plotRow.key); }, [plotRow, plotId]);

  /* WHICH batch — always exactly one, never all of them together.

     The plot's batches were summed into one "All batches" figure, and that
     figure could not be acted on: a plot is culled batch by batch, the ten
     percent line is drawn per batch, and two batches averaged together hide
     the one that is in trouble behind the one that is fine. So the choice is
     always a single block, and the first is chosen for you.

     Reset whenever the plot changes — a batch number means nothing on a
     different plot. */
  const batches = plotRow ? plotRow.blocks : [];
  const [batchId, setBatchId] = useState(null);
  const picked = batches.find((b) => b.batch === batchId) || batches[0] || null;
  useEffect(() => { setBatchId(null); }, [plotId]);
  useEffect(() => {
    if (!batchId && picked) setBatchId(picked.batch);
  }, [batchId, picked]);
  /* A count belongs to the block it was walked in, so moving to another one
     clears it rather than quietly re-attributing it. */
  useEffect(() => { setTerms([]); setTyping(''); }, [plotId, batchId]);

  /* The row the whole screen works from — one object, so the rate, the action
     and the case cannot read different figures. It is one plot and one batch:
     the block of ground somebody is standing in. */
  const row = picked;

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

  /* On a laptop, use the laptop.

     The keypad is drawn for a thumb in a nursery, and it stays the whole
     interface on a phone. But a Field Conductor writing up at a desk has a
     number pad and a backspace key already under their hands, and making them
     mouse over to a picture of a keypad to key 300 is asking them to use the
     worse of the two.

     The number pad is read by its PHYSICAL key (e.code) rather than by the
     character it sends. With Num Lock off, Chrome reports Numpad5 as "Clear"
     and Numpad4 as "ArrowLeft" — so a laptop with the lock off would have
     typed nothing at all, and the man at the desk would have decided the
     feature did not work. The keys under his fingers are numbered, so on
     this screen they enter numbers either way.

     Backspace is deletion everywhere, and it is stopped from bubbling
     because a browser with nothing focused reads it as "go back" — losing
     the count and the page with it. */
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Somebody typing into a field means that field, not the keypad.
      const el = e.target;
      if (el && el.closest && el.closest('input, textarea, select, [contenteditable]')) return;
      // The plot picker is a choice, not a count.
      if (picking) return;

      const pad = /^Numpad([0-9])$/.exec(e.code || '');
      if (pad)                          { press(pad[1]); e.preventDefault(); return; }
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); return; }
      if (e.key === 'Backspace')        { press('DEL'); e.preventDefault(); return; }
      if (e.key === 'Delete' || e.code === 'NumpadDecimal') {
        press('AC'); e.preventDefault(); return;
      }
      if (e.key === '+' || e.code === 'NumpadAdd') { press('+'); e.preventDefault(); return; }
      if (e.key === '=' || e.key === 'Enter')      { press('='); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
        /* Which block of the plot was walked. Without it the auditor is sent
           to a plot and left to work out which part of it was counted. It is
           always one batch now, so there is one name to give. */
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
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setPicking(true)}
              className="flex items-center gap-1.5 text-white font-black text-[15px] cursor-pointer"
            >
              {plotRow ? plotRow.plot : '—'}
              <span className="text-[10px] text-slate-500">▼</span>
            </button>
            {/* Which batch, beside the plot rather than folded into choosing
                it. Only when there is more than one: a dropdown offering one
                answer is furniture, so a single-batch plot just prints its
                number. */}
            {batches.length > 1 && (
              <select
                value={batchId || ''}
                onChange={(e) => setBatchId(e.target.value)}
                className="bg-[#1a1a1f] border border-[#2a2a33] text-slate-200 font-bold text-[11px]
                           rounded-lg px-2 py-1 tabular-nums cursor-pointer outline-none max-w-[130px]"
                aria-label={t('cull.batch')}
              >
                {batches.map((b) => (
                  <option key={b.batch} value={b.batch}>{b.batch}</option>
                ))}
              </select>
            )}
            {batches.length === 1 && batches[0].batch && (
              <span className="font-bold text-slate-400 text-[11px] tabular-nums">{batches[0].batch}</span>
            )}
          </div>
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

        {/* What the count leaves, and what that means.

            This was a thin strip of small print under the keypad, sized as an
            afterthought to the two figures above it. Those have gone under
            the ! now, and this is what the counting is FOR: what is left
            standing, and whether that clears ten percent. It is the answer
            the Field Conductor walked the plot to get, so it is a panel like
            the balance and reads at the same size. */}
        <div className="bg-[#101013] rounded-2xl px-4 py-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('cull.left')}
            </div>
            <div className="text-[26px] font-light tabular-nums leading-tight text-slate-300">
              {known ? fmtNum(left) : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('cull.estRate')}
            </div>
            <div className={`text-[26px] font-light tabular-nums leading-tight ${
              !known || !inang ? 'text-slate-600'
                : rateAfter > CULL_LIMIT ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {known && inang ? fmtPct(rateAfter) : '—'}
            </div>
          </div>
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
          plots={plotList}
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
/* The delete key's mark, drawn rather than typed.

   It was the character ⌫, which is not in every phone's font — and a glyph a
   font does not have comes out as an empty box, which is what a Field
   Conductor was looking at. A path cannot go missing. */
function Backspace() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" />
      <path d="M17 9.5l-5 5M12 9.5l5 5" />
    </svg>
  );
}

function Keypad({ onPress }) {
  const grey = 'bg-[#333336] hover:bg-[#4a4a4d] text-white';
  const dark = 'bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white';
  const amber = 'bg-amber-500 hover:bg-amber-400 text-white';
  const key = (label, k, cls, span) => (
    <button
      key={k}
      onClick={() => onPress(k)}
      aria-label={typeof label === 'string' ? undefined : 'delete'}
      className={`${cls} ${span || ''} grid place-items-center rounded-2xl text-[22px] font-medium tabular-nums transition-colors cursor-pointer active:scale-95`}
    >
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-4 grid-rows-5 gap-2 px-3 pb-1 pt-2 auto-rows-[54px] [&>button]:h-[54px]">
      {key('AC', 'AC', grey, 'col-span-2')}
      {key(<Backspace />, 'DEL', grey, 'col-span-2')}
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

/* Which plot. Every block a customer is COLLECTING from that this person may
   see, with the rate it stands at, so the choice is made on the figures
   rather than by remembering plot numbers.

   Not "every plot at Pengambilan" — that is what this said, and it stopped
   being true when cullingSource.js moved the list onto the delivery orders.
   A plot is here because a D/O collects from it, whatever PALMS says its
   stage is; the two disagreeing is a real mismatch to chase in the nursery,
   not something this screen resolves. */
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
                    {/* How many batches are standing in it, since the row is
                        the whole plot now and its figures are their sum. The
                        batch itself is chosen after, beside the plot name. */}
                    {p.blocks && p.blocks.length > 1 && (
                      <span className="font-bold text-slate-400 text-[11px] tabular-nums">
                        {p.blocks.length} {t('cull.batches')}
                      </span>
                    )}
                    {p.blocks && p.blocks.length === 1 && p.blocks[0].batch && (
                      <span className="font-bold text-slate-400 text-[11px] tabular-nums">{p.blocks[0].batch}</span>
                    )}
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
