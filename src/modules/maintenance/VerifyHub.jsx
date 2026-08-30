import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  VERIFY_SETUP_NEEDED,
  clearVerification,
  rejectRecord,
  verifyRecord,
  workTypeByKey,
  workTypeLabel,
} from './data.js';
import { relativeDay } from './RecordCard.jsx';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/* Why a record gets sent back. One tap, not a text box: this is pressed on a
   tablet standing in a nursery, and a reason nobody types is a reason nobody
   records. The stored value is English so the office reads one wording
   whatever language the conductor works in; the label on the button is
   translated. */
export const REJECT_REASONS = [
  { key: 'wrong_plot',   store: 'Wrong plot' },
  { key: 'wrong_dose',   store: 'Wrong dose' },
  { key: 'not_finished', store: 'Work not finished' },
  { key: 'no_photo',     store: 'Photo missing or unclear' },
  { key: 'wrong_date',   store: 'Wrong date' },
  { key: 'other',        store: 'Other' },
];

/** How far a card has to be dragged before letting go decides anything. */
const THRESHOLD = 110;

/**
 * The morning's submissions, one card at a time.
 *
 * A Field Conductor with thirty records to check does not want thirty rows
 * with a tick box each — they want the record in front of them, big enough to
 * read at arm's length, and one movement per answer. Right is yes, left is
 * no, and the same two answers are on buttons underneath for a mouse or for
 * anybody who would rather press than swipe.
 *
 * Nothing here is final: every answer raises a banner that takes it back for
 * three seconds, because the cost of a mis-swipe has to be smaller than the
 * cost of being careful, or the deck gets read slowly and nobody uses it.
 */
export default function VerifyHub({ records, columnsReady = true, staffName, onClose, onChanged }) {
  const { t, lang } = useLang();
  const today = new Date().toISOString().slice(0, 10);

  // The deck as it stood when the hub opened. Held locally so a card leaving
  // is an animation rather than the list underneath re-sorting mid-swipe.
  const [queue, setQueue] = useState(() => [...(records || [])]);
  const [drag, setDrag] = useState(null);      // { dx, dy } while a finger is down
  const [flying, setFlying] = useState(null);  // 'left' | 'right' — the card on its way out
  const [asking, setAsking] = useState(null);  // the record waiting for a reason
  const [undo, setUndo] = useState(null);      // { record, verb }
  const [error, setError] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(!columnsReady);
  const [done, setDone] = useState({ ok: 0, back: 0 });
  const start = useRef(null);
  const undoTimer = useRef(null);

  const top = queue[0] || null;

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Escape closes, the way every other sheet in the portal does.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const approve = (record) =>
    settle(record, 'verified', () => verifyRecord(record.id, staffName));

  const sendBack = (record, reason) => {
    setAsking(null);
    settle(record, 'rejected', () => rejectRecord(record.id, staffName, reason));
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
    clearVerification(record.id)
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
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col">
      {/* Header: what is left, and the way out. */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="text-white font-black text-[15px] uppercase tracking-wide truncate">
            {t('mt.verifyHub')}
          </div>
          <div className="text-white/60 text-[11px] font-bold">
            {t('mt.verifyLeft', { n: queue.length })}
            {(done.ok || done.back) ? ` · ${t('mt.verifyTally', { ok: done.ok, back: done.back })}` : ''}
          </div>
        </div>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none grid place-items-center">
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4">
        <div className="relative w-full max-w-[460px] h-full max-h-[640px]">
          {setupNeeded ? (
            <Notice tone="amber" text={t('mt.verifySetupNeeded')} />
          ) : !queue.length ? (
            <Notice tone="emerald" text={t('mt.verifyAllDone')} />
          ) : (
            /* Two cards behind the top one, so the deck reads as a deck and a
               card leaving reveals the next rather than a hole. Reversed, so
               the top card is painted last and takes the drag. */
            [...queue.slice(0, 3)].reverse().map((r, idx, arr) => {
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
                      : `translateY(${depth * 18}px) scale(${1 - depth * 0.04})`,
                    transition: isTop && (!drag || flying) ? 'transform .22s ease-out, opacity .22s ease-out' : 'none',
                    opacity: isTop && flying ? 0 : 1,
                    touchAction: isTop ? 'pan-y' : undefined,
                  }}
                  className={`absolute inset-0 bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden
                              ${isTop ? 'cursor-grab active:cursor-grabbing z-10' : 'z-0'}`}
                >
                  <VerifyCard record={r} today={today} t={t} lang={lang} yes={isTop && yes} no={isTop && no} />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* The same two answers, for a mouse. */}
      {!setupNeeded && !!queue.length && (
        <div className="shrink-0 flex items-center justify-center gap-5 pb-6">
          <button onClick={() => top && setAsking(top)} aria-label={t('mt.reject')}
            className="w-[62px] h-[62px] rounded-full bg-white shadow-xl text-rose-600 text-[26px] font-black
                       grid place-items-center hover:bg-rose-50 active:scale-95 transition">
            ✕
          </button>
          <button onClick={() => top && approve(top)} aria-label={t('mt.approve')}
            className="w-[62px] h-[62px] rounded-full bg-white shadow-xl text-emerald-600 text-[26px] font-black
                       grid place-items-center hover:bg-emerald-50 active:scale-95 transition">
            ✓
          </button>
        </div>
      )}

      {/* Why it is going back. */}
      {asking && (
        <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAsking(null)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl">
            <div className="font-black text-slate-800 text-[15px] uppercase tracking-wide mb-1">
              {t('mt.rejectWhy')}
            </div>
            <div className="text-[12px] font-bold text-slate-400 mb-3">
              {t('mt.rejectHint')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {REJECT_REASONS.map((r) => (
                <button key={r.key} onClick={() => sendBack(asking, r.store)}
                  className="rounded-xl border-2 border-slate-200 hover:border-rose-400 hover:bg-rose-50
                             px-3 py-3 text-[12px] font-black text-slate-700 text-left transition-colors">
                  {t(`mt.reason.${r.key}`)}
                </button>
              ))}
            </div>
            <button onClick={() => setAsking(null)}
              className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black
                         text-[11px] uppercase tracking-widest rounded-xl py-3">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Three seconds to change your mind. */}
      {undo && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3
                        bg-slate-900 text-white rounded-2xl shadow-2xl pl-4 pr-2 py-2.5 max-w-[92vw]">
          <span className="text-[12.5px] font-bold truncate">
            {t(undo.verb === 'verified' ? 'mt.undoVerified' : 'mt.undoSentBack',
               { plot: undo.record.plot_name })}
          </span>
          <button onClick={takeBack}
            className="shrink-0 bg-white/15 hover:bg-white/25 rounded-xl px-3 py-1.5
                       font-black text-[11px] uppercase tracking-widest">
            {t('mt.undo')}
          </button>
        </div>
      )}

      {error && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-rose-600 text-white
                        text-[12.5px] font-bold rounded-2xl shadow-2xl px-4 py-3 max-w-[92vw]">
          {t('mt.saveErr', { msg: error })}
        </div>
      )}
    </div>
  );
}

function Notice({ tone, text }) {
  const skin = tone === 'amber'
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-white border-slate-200 text-emerald-700';
  return (
    <div className={`absolute inset-0 rounded-3xl border grid place-items-center px-6 text-center ${skin}`}>
      <div className="text-[14px] font-black leading-relaxed">{text}</div>
    </div>
  );
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
      <div className={`absolute top-[98px] left-5 z-10 rounded-xl border-4 px-3 py-1 font-black text-[15px]
                       uppercase tracking-widest rotate-[-12deg] transition-opacity
                       border-emerald-500 text-emerald-600 ${yes ? 'opacity-100' : 'opacity-0'}`}>
        {t('mt.approve')}
      </div>
      <div className={`absolute top-[98px] right-5 z-10 rounded-xl border-4 px-3 py-1 font-black text-[15px]
                       uppercase tracking-widest rotate-[12deg] transition-opacity
                       border-rose-500 text-rose-600 ${no ? 'opacity-100' : 'opacity-0'}`}>
        {t('mt.reject')}
      </div>

      <div className={`px-5 pt-5 pb-4 ${tint.bg}`}>
        <div className="flex items-center gap-3">
          <span className="w-[52px] h-[52px] rounded-2xl bg-white/70 grid place-items-center shrink-0">
            <WorkIcon workKey={r.work_type} className={`w-8 h-8 ${tint.fg}`} />
          </span>
          <div className="min-w-0">
            {/* The worker, first and biggest: this is a signature on somebody's
                morning, and whose morning it is comes before what was done. */}
            <div className="text-[17px] font-black text-slate-900 truncate">
              {r.worked_by || r.reported_by || t('mt.unknownWorker')}
            </div>
            <div className={`text-[12.5px] font-black ${tint.fg} truncate`}>
              {workTypeLabel(wt, lang) || r.jenis || '—'} · {r.plot_name}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
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
                          hover:bg-slate-100 px-3.5 py-3 transition-colors">
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
            <div className="rounded-2xl border border-dashed border-slate-200 px-3.5 py-3
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
                     className="w-[74px] h-[74px] object-cover rounded-xl border border-slate-200" />
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
