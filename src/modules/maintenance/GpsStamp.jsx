import { useEffect, useState } from 'react';
import { useLang } from '../../context/LanguageContext.jsx';
import { GEO_DENIED, GEO_UNSUPPORTED, capturePosition, formatPosition } from '../../lib/geo.js';

/**
 * The GPS stamp on a record.
 *
 * Asks for the position as soon as the form opens, because the answer takes a
 * few seconds and the form takes longer to fill in than that — by the time
 * anybody looks down here it is usually already found. A failure is said
 * plainly and can be tried again; it never blocks the save, because a record
 * of work done is worth more than a record of where it was done.
 */
export default function GpsStamp({ value, onChange }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function locate() {
    setBusy(true);
    setErr(null);
    try {
      onChange(await capturePosition());
    } catch (e) {
      const code = (e && e.message) || '';
      setErr(code === GEO_DENIED ? t('mt.gpsDenied')
           : code === GEO_UNSUPPORTED ? t('mt.gpsNone')
           : t('mt.gpsUnavailable'));
      onChange(null);
    }
    setBusy(false);
  }

  // Once, when the form opens. Not on every change of `value`, or clearing a
  // fix would immediately fetch another one.
  useEffect(() => { locate(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const label = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1';

  return (
    <div className="mb-3">
      <span className={label}>{t('mt.gps')}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="text-[17px] leading-none shrink-0" aria-hidden="true">📍</span>
        <div className="flex-1 min-w-0">
          {busy ? (
            <div className="text-[13px] font-bold text-slate-400 animate-pulse">{t('mt.gpsGetting')}</div>
          ) : value ? (
            <>
              <div className="text-[13px] font-black text-slate-700 tabular-nums truncate">
                {formatPosition(value)}
              </div>
              {value.accuracy != null && (
                <div className="text-[10.5px] font-bold text-slate-400">
                  {t('mt.gpsAccuracy', { n: value.accuracy })}
                </div>
              )}
            </>
          ) : (
            <div className="text-[12px] font-bold text-amber-700">{err || t('mt.gpsUnavailable')}</div>
          )}
        </div>
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          className="shrink-0 rounded-lg border border-slate-200 bg-white disabled:opacity-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600"
        >
          {value ? t('mt.gpsAgain') : t('mt.gpsRetry')}
        </button>
      </div>
    </div>
  );
}
