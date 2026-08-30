import { useLang } from '../../context/LanguageContext.jsx';
import { verifyState, workTypeByKey, workTypeLabel } from './data.js';
import { tintOf } from './tints.js';
import WorkIcon from './WorkIcons.jsx';

/* "Today", "Yesterday", then the date. Most of a list is the last day or two,
   and a Field Conductor reads those faster as words than as 2026-08-22.
   Anything older gets the date, because "5 days ago" is a sum nobody wants to
   do. */
export function relativeDay(iso, today, t) {
  if (!iso) return '—';
  if (iso === today) return t('mt.today');
  const ms = Date.parse(iso), now = Date.parse(today);
  if (Number.isFinite(ms) && Number.isFinite(now)) {
    if (Math.round((now - ms) / 86400000) === 1) return t('mt.yesterday');
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return iso;
}

/**
 * One recorded job, as it appears in every list that shows one.
 *
 * Was written out inside the module's own list; the history dialog needs the
 * same card, and two copies of a card is two chances for the same record to
 * read differently depending on which screen it is opened from.
 */
export default function RecordCard({ record: r, today, mayEdit, onEdit, onDelete }) {
  const { t, lang } = useLang();
  const wt = workTypeByKey(r.work_type);
  const state = verifyState(r);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-3.5">
      <div className="flex items-start gap-3">
        {/* The job's own colour and icon, so the list is scanned the same way
            the week above it is. */}
        <span className={`w-[38px] h-[38px] rounded-xl grid place-items-center shrink-0 ${tintOf(r.work_type).bg}`}>
          <WorkIcon workKey={r.work_type} className={`w-[22px] h-[22px] ${tintOf(r.work_type).fg}`} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="font-black text-slate-800 text-[14px] leading-tight">
            {workTypeLabel(wt, lang) || r.jenis || '—'} · {r.plot_name}
          </div>
          {/* One line for everything that is context rather than content:
              when, what was used, and who. */}
          <div className="text-[11.5px] font-bold text-slate-400 mt-0.5">
            {[
              relativeDay(r.work_date, today, t),
              r.chemical || null,
              r.qty != null ? Number(r.qty).toLocaleString() : null,
              r.worked_by || r.reported_by || null,
            ].filter(Boolean).join(' · ')}
          </div>

          {r.batch_name && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {String(r.batch_name).split(',').map((b) => b.trim()).filter(Boolean).map((b) => (
                <span key={b} className="text-[10px] font-black tabular-nums text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">
                  {b}
                </span>
              ))}
            </div>
          )}
          {r.remark && (
            <div className="text-[12px] text-slate-500 mt-1.5 italic break-words">{r.remark}</div>
          )}
          {/* Sent back says why. Without the reason the card only says the
              conductor was unhappy, which nobody can act on. */}
          {state === 'rejected' && (
            <div className="text-[11px] font-bold text-rose-600 mt-1.5">
              {t('mt.sentBackBy', {
                who: r.rejected_by || '—',
                why: r.reject_reason || t('mt.noReason'),
              })}
            </div>
          )}
          {r.photo_urls && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {String(r.photo_urls).split(',').map((u) => u.trim()).filter(Boolean).map((u) => (
                // Opens full size in a new tab; the card only needs a thumbnail.
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="" loading="lazy"
                       className="w-[42px] h-[42px] object-cover rounded-[9px] border border-slate-200" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Where the record stands: still on the phone, waiting to be checked,
            checked, or sent back. */}
        {r._pending ? (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-1">
            ⏳ {t('mt.waiting')}
          </span>
        ) : state === 'verified' ? (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-1"
                title={r.verified_by || ''}>
            ✓ {t('mt.verified')}
          </span>
        ) : state === 'rejected' ? (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2 py-1">
            ↩ {t('mt.sentBack')}
          </span>
        ) : (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-1">
            {t('mt.awaitingCheck')}
          </span>
        )}
      </div>

      {mayEdit && !r._pending && (
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => onEdit(r)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl py-2"
          >
            {t('mt.edit')}
          </button>
          <button
            onClick={() => onDelete(r)}
            className="px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[11px] uppercase tracking-widest rounded-xl py-2"
          >
            {t('mt.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
