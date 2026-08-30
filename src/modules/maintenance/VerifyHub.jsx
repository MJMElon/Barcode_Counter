import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  VERIFY_SETUP_NEEDED,
  workTypeByKey,
  workTypeLabel,
} from './data.js';
import { relativeDay } from './RecordCard.jsx';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/* Why a record gets sent back. One tap for the two answers that come up over
   and over, and a box for everything else — a fixed list of six was a list
   nobody read to the end of, and the reason that actually applied was usually
   the seventh. The stored value is English so the office reads one wording
   whatever language the conductor works in; the button is translated. */
export const REJECT_REASONS = [
  { key: 'not_finished', store: 'Work not finished' },
  { key: 'no_track',     store: 'No track record' },
];

/** How far a card has to be dragged before letting go decides anything. */
const THRESHOLD = 110;

/**
 * The morning's submissions, one card at a time, under the week.
 *
 * A Field Conductor with thirty records to check does not want thirty rows
 * with a tick box each — they want the record in front of them, big enough to
 * read at arm's length, and one movement per answer. Right is yes, left is
 * no, and the same two answers are on buttons underneath for a mouse or for
 * anybody who would rather press than swipe.
 *
 * On the page rather than behind a button: checking the morning is part of
 * the morning, and a deck nobody can see is a deck nobody opens.
 *
 * Nothing here is final: every answer raises a banner that takes it back for
 * three seconds, because the cost of a mis-swipe has to be smaller than the
 * cost of being careful, or the deck gets read slowly and nobody uses it.
 */
export default function VerifyHub({
  records, columnsReady = true,
  /* The writes go back through the module's source rather than straight to
     Supabase: the same board serves the Worker Portal through the worker_*
     functions, and a component that reaches for the table directly would work
     on one door and fail silently on the other. */
  onApprove, onReject, onUndo, onChanged,
}) {
  const { t, lang } = useLang();
  const today = new Date().toISOString().slice(0, 10);

  /* The deck as it stood when the page last read the records. Held locally so
     a card leaving is an animation rather than the list underneath re-sorting
     mid-swipe — and re-seeded when a genuinely different set arrives, or a
     reload would leave the conductor looking at a stale deck. */
  const [queue, setQueue] = useState(() => [...(records || [])]);
  const seed = useRef(sig(records));
  useEffect(() => {
    const s = sig(records);
    if (s === seed.current) return;
    seed.current = s;
    setQueue([...(records || [])]);
  }, [records]);

  const [drag, setDrag] = useState(null);      // { dx, dy } while a finger is down
  const [flying, setFlying] = useState(null);  // 'left' | 'right' — the card on its way out
  const [asking, setAsking] = useState(null);  // the record waiting for a reason
  const [typed, setTyped] = useState('');      // a reason in the conductor's own words
  const [undo, setUndo] = useState(null);      // { record, verb }
  const [error, setError] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(!columnsReady);
  const [done, setDone] = useState({ ok: 0, back: 0 });
  const start = useRef(null);
  const undoTimer = useRef(null);

  const top = queue[0] || null;

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  function raiseUndo(record, verb) {
    clearTimeout(undoTimer.current);
    setUndo({ record, verb });
    undoTimer.current = setTimeout(() => setUndo(null), 3000);
  }

  function fail(e) {
    if (e && e.message === VERIFY_SETUP_NEEDED) { setSetupNeeded(true); return; }
    setError((e && e.message) || String(e));
  }

  /* The card leaves first and the write follows. A conductor working through
     thirty records should never be waiting on a round trip to see the next
     one — and if the write does fail, the card comes back and says so.

     The card is thrown off screen before it is dropped from the deck, or it
     would simply disappear: removing it in the same render that starts the
     animation leaves nothing for the animation to move. */
  function settle(record, verb, run) {
    setDrag(null);
    setFlying(verb === 'verified' ? 'right' : 'left');
    setTimeout(() => {
      setQueue((q) => q.filter((r) => r.id !== record.id));
      setFlying(null);
    }, 220);
    setDone((d) => (verb === 'verified' ? { ...d, ok: d.ok + 1 } : { ...d, back: d.back + 1 }));
    raiseUndo(record, verb);
    run()
      .then(() => onChanged && onChanged())
      .catch((e) => {
        setQueue((q) => [record, ...q.filter((r) => r.id !== record.id)]);
        setDone((d) => (verb === 'verified' ? { ...d, ok: d.ok - 1 } : { ...d, back: d.back - 1 }));
        setUndo(null);
        fail(e);
      });
  }

  const approve = (record) => settle(record, 'verified', () => onApprove(record));

  const sendBack = (record, reason) => {
    setAsking(null);
    setTyped('');
    settle(record, 'rejected', () => onReject(record, reason));
  };

  /* Taking it back puts the record where it was — waiting — and returns it to
     the front of the deck, so a mis-swipe is corrected by answering again
     rather than by hunting for the record afterwards. */
  function takeBack() {
    if (!undo) return;
    const { record, verb } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    setDone((d) => (verb === 'verified' ? { ...d, ok: d.ok - 1 } : { ...d, back: d.back - 1 }));
    setQueue((q) => [record, ...q.filter((r) => r.id !== record.id)]);
    onUndo(record)
      .then(() => onChanged && onChanged())
      .catch(fail);
  }

  // ── the drag itself ──
  function onDown(e) {
    if (!top || flying || asking) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  }
  function onUp() {
    if (!start.current) return;
    const moved = (drag && drag.dx) || 0;
    start.current = null;
    if (!top) { setDrag(null); return; }
    if (moved > THRESHOLD) { approve(top); return; }
    // Left asks why before it commits, so the card springs back and waits
    // rather than leaving on an answer nobody has given yet.
    setDrag(null);
    if (moved < -THRESHOLD) setAsking(top);
  }

  const dx = flying === 'right' ? 700 : flying === 'left' ? -700 : (drag ? drag.dx : 0);
  const dy = drag && !flying ? drag.dy * 0.35 : 0;
  const tilt = Math.max(-14, Math.min(14, dx / 14));
  const yes = dx > 55, no = dx < -55;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,.06)]">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-emerald-50 flex items-center justify-between gap-2">
        <span className="font-black uppercase tracking-widest text-[11px] sm:text-xs text-emerald-800 truncate">
          ✓ {t('mt.verifyHub')}
        </span>
        <span className="text-[10px] font-black text-emerald-700 shrink-0 tabular-nums">
          {setupNeeded ? '—' : t('mt.verifyLeft', { n: queue.length })}
        </span>
      </div>

      {setupNeeded ? (
        <div className="m-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4
                        text-[13px] font-black text-amber-800 leading-relaxed">
          {t('mt.verifySetupNeeded')}
        </div>
      ) : !queue.length ? (
        <div className="px-4 py-6 text-center">
          <div className="text-[13px] font-black text-emerald-700">{t('mt.verifyAllDone')}</div>
          {(done.ok || done.back) > 0 && (
            <div className="text-[11px] font-bold text-slate-400 mt-1">
              {t('mt.verifyTally', { ok: done.ok, back: done.back })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Capped and centred: a card deck the full width of a tablet is
              a card nobody can throw, and the record reads better in a column
              than stretched across nine hundred pixels. */}
          <div className="relative mx-auto mt-3 w-[calc(100%-24px)] max-w-[460px] h-[440px] sm:h-[470px]">
            {/* Two cards behind the top one, so the deck reads as a deck and a
                card leaving reveals the next rather than a hole. Reversed, so
                the top card is painted last and takes the drag. */}
            {[...queue.slice(0, 3)].reverse().map((r, idx, arr) => {
              const depth = arr.length - 1 - idx;      // 0 = the top card
              const isTop = depth === 0;
              return (
                <div
                  key={r.id}
                  onPointerDown={isTop ? onDown : undefined}
                  onPointerMove={isTop ? onMove : undefined}
                  onPointerUp={isTop ? onUp : undefined}
                  onPointerCancel={isTop ? onUp : undefined}
                  style={{
                    transform: isTop
                      ? `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`
                      : `translateY(${depth * 14}px) scale(${1 - depth * 0.035})`,
                    transition: isTop && (!drag || flying) ? 'transform .22s ease-out, opacity .22s ease-out' : 'none',
                    opacity: isTop && flying ? 0 : 1,
                    // Vertical scrolling inside a long card has to keep
                    // working on a phone; only the sideways gesture is ours.
                    touchAction: isTop ? 'pan-y' : undefined,
                  }}
                  className={`absolute inset-0 bg-white rounded-2xl border border-slate-200 overflow-hidden
                              ${isTop ? 'shadow-xl cursor-grab active:cursor-grabbing z-10' : 'shadow z-0'}`}
                >
                  <VerifyCard record={r} today={today} t={t} lang={lang} yes={isTop && yes} no={isTop && no} />
                </div>
              );
            })}
          </div>

          {/* The same two answers, for a mouse. */}
          <div className="flex items-center justify-center gap-5 py-4">
            <button onClick={() => top && setAsking(top)} aria-label={t('mt.reject')}
              className="w-[56px] h-[56px] rounded-full bg-white border border-slate-200 shadow-lg
                         text-rose-600 text-[24px] font-black grid place-items-center
                         hover:bg-rose-50 active:scale-95 transition cursor-pointer">
              ✕
            </button>
            <button onClick={() => top && approve(top)} aria-label={t('mt.approve')}
              className="w-[56px] h-[56px] rounded-full bg-white border border-slate-200 shadow-lg
                         text-emerald-600 text-[24px] font-black grid place-items-center
                         hover:bg-emerald-50 active:scale-95 transition cursor-pointer">
              ✓
            </button>
          </div>
        </>
      )}

      {/* Why it is going back. */}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
               onClick={() => { setAsking(null); setTyped(''); }} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl">
            <div className="font-black text-slate-800 text-[15px] uppercase tracking-wide mb-1">
              {t('mt.rejectWhy')}
            </div>
            <div className="text-[12px] font-bold text-slate-400 mb-3">
              {t('mt.rejectHint')}
            </div>

            <div className="space-y-2">
              {REJECT_REASONS.map((r) => (
                <button key={r.key} onClick={() => sendBack(asking, r.store)}
                  className="w-full rounded-xl border-2 border-slate-200 hover:border-rose-400 hover:bg-rose-50
                             px-4 py-3.5 text-[13px] font-black text-slate-700 text-left transition-colors cursor-pointer">
                  {t(`mt.reason.${r.key}`)}
                </button>
              ))}
            </div>

            {/* Everything the two buttons do not cover. Sending back with an
                empty box would file a refusal nobody can act on, so the
                button waits until something has been written. */}
            <div className="mt-3">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                {t('mt.reason.other')}
              </label>
              <textarea
                rows={2}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t('mt.reasonPlaceholder')}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm
                           font-semibold outline-none focus:border-rose-400"
              />
              <button
                onClick={() => sendBack(asking, typed.trim())}
                disabled={!typed.trim()}
                className="w-full mt-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-default
                           text-white font-black text-[11px] uppercase tracking-widest rounded-xl py-3 cursor-pointer"
              >
                {t('mt.reject')}
              </button>
            </div>

            <button onClick={() => { setAsking(null); setTyped(''); }}
              className="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black
                         text-[11px] uppercase tracking-widest rounded-xl py-3 cursor-pointer">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Three seconds to change your mind. */}
      {undo && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3
                        bg-slate-900 text-white rounded-2xl shadow-2xl pl-4 pr-2 py-2.5 max-w-[92vw]">
          <span className="text-[12.5px] font-bold truncate">
            {t(undo.verb === 'verified' ? 'mt.undoVerified' : 'mt.undoSentBack',
               { plot: undo.record.plot_name })}
          </span>
          <button onClick={takeBack}
            className="shrink-0 bg-white/15 hover:bg-white/25 rounded-xl px-3 py-1.5
                       font-black text-[11px] uppercase tracking-widest cursor-pointer">
            {t('mt.undo')}
          </button>
        </div>
      )}

      {error && (
        <div className="mx-3 mb-3 bg-rose-50 border border-rose-200 text-rose-700
                        text-[12.5px] font-bold rounded-xl px-4 py-3">
          {t('mt.saveErr', { msg: error })}
        </div>
      )}
    </div>
  );
}

/** Which records these are, so a reload that changed nothing does not throw
    away a deck the conductor is halfway through. */
function sig(rows) {
  return (rows || []).map((r) => r.id).join(',');
}

/** The record itself, filling the card. */
function VerifyCard({ record: r, today, t, lang, yes, no }) {
  const wt = workTypeByKey(r.work_type);
  const tint = tintOf(r.work_type);
  const hasMap = r.gps_lat != null && r.gps_lng != null;
  const mapUrl = hasMap ? `https://www.google.com/maps?q=${r.gps_lat},${r.gps_lng}` : null;
  const photos = String(r.photo_urls || '').split(',').map((u) => u.trim()).filter(Boolean);

  return (
    <div className="h-full flex flex-col">
      {/* Which way this card is going, while it is being pushed. */}
      <div className={`absolute top-[86px] left-5 z-10 rounded-xl border-4 px-3 py-1 font-black text-[15px]
                       uppercase tracking-widest rotate-[-12deg] transition-opacity
                       border-emerald-500 text-emerald-600 ${yes ? 'opacity-100' : 'opacity-0'}`}>
        {t('mt.approve')}
      </div>
      <div className={`absolute top-[86px] right-5 z-10 rounded-xl border-4 px-3 py-1 font-black text-[15px]
                       uppercase tracking-widest rotate-[12deg] transition-opacity
                       border-rose-500 text-rose-600 ${no ? 'opacity-100' : 'opacity-0'}`}>
        {t('mt.reject')}
      </div>

      <div className={`px-4 pt-4 pb-3 ${tint.bg}`}>
        <div className="flex items-center gap-3">
          <span className="w-[48px] h-[48px] rounded-2xl bg-white/70 grid place-items-center shrink-0">
            <WorkIcon workKey={r.work_type} className={`w-7 h-7 ${tint.fg}`} />
          </span>
          <div className="min-w-0">
            {/* The worker, first and biggest: this is a signature on somebody's
                morning, and whose morning it is comes before what was done. */}
            <div className="text-[16px] font-black text-slate-900 truncate">
              {r.worked_by || r.reported_by || t('mt.unknownWorker')}
            </div>
            <div className={`text-[12px] font-black ${tint.fg} truncate`}>
              {workTypeLabel(wt, lang) || r.jenis || '—'} · {r.plot_name}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
        <Row label={t('mt.date')} value={relativeDay(r.work_date, today, t)} />
        <Row label={t('mt.nursery')} value={r.nursery_name || '—'} />
        <Row label={t('mt.chemical')} value={r.chemical || t('mt.noChemical')} />
        <Row label={t('mt.qty')} value={r.qty != null ? Number(r.qty).toLocaleString() : '—'} />
        {r.batch_name && <Row label={t('mt.batches')} value={r.batch_name} />}

        {/* Where the work happened. Opens the phone or tablet's own map rather
            than drawing one here — the answer wanted is "is that the plot", and
            the map already on the device answers it better than a thumbnail. */}
        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {t('mt.mapLabel')}
          </div>
          {hasMap ? (
            <a href={mapUrl} target="_blank" rel="noreferrer"
               className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50
                          hover:bg-slate-100 px-3.5 py-2.5 transition-colors">
              <span className="w-9 h-9 rounded-xl bg-white grid place-items-center shrink-0 text-[18px]">📍</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-black text-slate-700 truncate">
                  {Number(r.gps_lat).toFixed(5)}, {Number(r.gps_lng).toFixed(5)}
                </span>
                <span className="block text-[11px] font-bold text-slate-400">
                  {[
                    r.gps_distance_m != null ? t('mt.walked', { m: Math.round(r.gps_distance_m) }) : null,
                    r.gps_points != null ? t('mt.fixes', { n: r.gps_points }) : null,
                  ].filter(Boolean).join(' · ') || t('mt.openMap')}
                </span>
              </span>
              <span className="text-slate-300 text-[18px] shrink-0">›</span>
            </a>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 px-3.5 py-2.5
                            text-[12px] font-bold text-slate-400">
              {t('mt.noTrack')}
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {t('mt.remark')}
          </div>
          <div className={`text-[13px] ${r.remark ? 'text-slate-700 font-semibold' : 'text-slate-400 font-bold'}`}>
            {r.remark || t('mt.noRemark')}
          </div>
        </div>

        {!!photos.length && (
          <div className="flex flex-wrap gap-2">
            {photos.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="" loading="lazy"
                     className="w-[68px] h-[68px] object-cover rounded-xl border border-slate-200" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-[92px] shrink-0">
        {label}
      </span>
      <span className="text-[13.5px] font-black text-slate-800 min-w-0 break-words">{value}</span>
    </div>
  );
}
