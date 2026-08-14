import { useMemo, useState } from 'react';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import {
  NURSERIES,
  cullingRate,
  fmtNum,
  fmtPct,
  getSessionData,
  targetPokok,
  videoNeeded,
} from './data.js';

// Culling Calculator for Field Conductors — ported from the NurseryFCmobile
// trial app. Flow: pick a nursery → plot table → tap Pokok Inang to record
// amounts (Field Conductor first; a Site Auditor second entry unlocks when the
// rate stays above 10%; video evidence is requested when even the Auditor
// amount leaves the rate above 10%). Labels stay in Malay like the original.
export default function CullingModule() {
  const { staffName } = useAuth();
  const { t } = useLang();

  const data = useMemo(() => getSessionData(), []);
  const [nursery, setNursery] = useState(null); // selected nursery key
  const [editing, setEditing] = useState(null); // plot row index in the modal
  const [, setTick] = useState(0); // re-render after mutating session data
  const refresh = () => setTick((n) => n + 1);

  const cfg = nursery ? NURSERIES[nursery] : null;
  const rows = nursery ? data[nursery] : [];

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav
        title={t('cull.title')}
        subtitle="FC Portal"
        user={staffName}
        back={nursery ? undefined : '/dashboard'}
      />
      <div className="max-w-[900px] mx-auto px-3 sm:px-6 py-4 space-y-3">
        {!nursery ? (
          <>
            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.25em]">
              {t('cull.step1')}
            </div>
            <h2 className="text-xl font-black text-slate-800 -mt-1">{t('cull.pickNursery')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {Object.entries(NURSERIES).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => setNursery(key)}
                  className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,.12)] hover:-translate-y-0.5 hover:border-emerald-500 transition-all p-4 text-left cursor-pointer"
                >
                  <span className="inline-block text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-1">
                    {c.count} plot
                  </span>
                  <div className="text-2xl font-black text-slate-800 mt-2">{key}</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {c.label ? `${c.label} · ` : ''}
                    {c.prefix}1–{c.prefix}
                    {c.count}
                  </div>
                  <div className="text-slate-300 font-black text-lg mt-1">→</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNursery(null)}
                className="bg-white hover:bg-emerald-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-500 hover:text-emerald-700 uppercase tracking-wider transition-colors cursor-pointer"
              >
                ← {t('cull.nurseries')}
              </button>
              <div className="min-w-0">
                <div className="font-black text-slate-800 text-[15px] leading-tight">{nursery}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  {cfg.label || `${cfg.count} plot`}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-500">
                <b className="text-slate-800">{cfg.count}</b> plot
              </span>
              <span className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-500">
                {t('cull.tapHint')}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <th className="px-3 py-2.5 sticky left-0 bg-slate-50">Plot</th>
                      <th className="px-3 py-2.5">Transplant</th>
                      <th className="px-3 py-2.5">{t('cull.balance')}</th>
                      <th className="px-3 py-2.5">Pokok Inang</th>
                      <th className="px-3 py-2.5">{t('cull.rate')}</th>
                      <th className="px-3 py-2.5">{t('cull.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rate = cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant);
                      const hot = rate > 0.1;
                      // Tindakan:
                      //  rate <= 10%                         -> green  (move pokok inang + drone)
                      //  rate > 10% AND auditor has entered  -> amber  (tell HQ)
                      //  rate > 10% AND only FC has entered  -> red    (wait for Site Auditor)
                      //  rate > 10% AND nothing entered yet  -> neutral placeholder
                      let act;
                      if (!hot) {
                        act = (
                          <span className="text-emerald-700 font-bold text-[11px] leading-tight">
                            {row.pokok === null ? (
                              t('cull.actDrone')
                            ) : (
                              <>
                                {t('cull.actMove')}
                                <br />
                                {t('cull.actDrone')}
                              </>
                            )}
                          </span>
                        );
                      } else if (row.pokokAuditor !== null) {
                        act = <span className="text-amber-600 font-bold text-[11px]">{t('cull.actHQ')}</span>;
                      } else if (row.pokok !== null) {
                        act = <span className="text-rose-600 font-bold text-[11px]">{t('cull.actWait')}</span>;
                      } else {
                        act = <span className="text-slate-300 font-bold">—</span>;
                      }
                      return (
                        <tr key={row.plot} className="border-t border-slate-100">
                          <td className="px-3 py-2.5 font-black text-slate-800 sticky left-0 bg-white">
                            {row.plot}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-600">{fmtNum(row.transplant)}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-600">{fmtNum(row.balance)}</td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => setEditing(idx)}
                              className={`rounded-xl px-3 py-1.5 text-[12px] font-black transition-colors cursor-pointer ${
                                row.pokok === null
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {row.pokok === null
                                ? t('cull.fillIn')
                                : fmtNum((row.pokok || 0) + (row.pokokAuditor || 0))}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-black border ${
                                hot
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-teal-50 text-teal-700 border-teal-200'
                              }`}
                            >
                              {fmtPct(rate)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">{act}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {nursery && editing !== null && (
        <EntryModal
          nurseryKey={nursery}
          row={rows[editing]}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
          t={t}
        />
      )}
    </div>
  );
}

function parseAmount(raw) {
  return raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
}

// Pokok Inang entry pop-up with live before/after culling rate. Field
// Conductor keys in first; when the saved FC amount still leaves the rate
// above 10% the modal reopens in the Auditor stage. Saved amounts lock and
// need a confirmation before they can be changed.
function EntryModal({ nurseryKey, row, onClose, t }) {
  const cfg = NURSERIES[nurseryKey];

  // Auditor stage: FC has already saved AND the rate with only the FC amount
  // is still above 10%.
  const fcOnlyRate = cullingRate(row.balance, row.pokok, null, row.transplant);
  const stage = row.pokok !== null && fcOnlyRate > 0.1 ? 'auditor' : 'fc';

  const [fcVal, setFcVal] = useState(row.pokok === null ? '' : String(row.pokok));
  const [audVal, setAudVal] = useState(row.pokokAuditor === null ? '' : String(row.pokokAuditor));
  const [fcLocked, setFcLocked] = useState(row.pokok !== null);
  const [audLocked, setAudLocked] = useState(row.pokokAuditor !== null);
  const [fcRevealed, setFcRevealed] = useState(false); // FC input shown inside the Auditor stage
  const [pendingEdit, setPendingEdit] = useState(null); // 'fc' | 'auditor' | 'fc-reveal'
  const [videoShown, setVideoShown] = useState(videoNeeded(row));
  const [videoName, setVideoName] = useState(row.video);
  const [videoUrl, setVideoUrl] = useState(null);

  const fcVisible = stage === 'fc' || fcRevealed;
  const audVisible = stage === 'auditor';

  // value in play for each side: from a visible input, else the saved value
  const fc = fcVisible ? parseAmount(fcVal) : row.pokok;
  const aud = audVisible ? parseAmount(audVal) : row.pokokAuditor;

  const beforeRate = cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant);
  const afterRate = cullingRate(row.balance, fc, aud, row.transplant);
  const hasInput = (fcVisible && fcVal !== '') || (audVisible && audVal !== '');
  const diff = beforeRate - afterRate; // positive = went DOWN

  function confirmEdit() {
    if (pendingEdit === 'fc-reveal') {
      setFcRevealed(true);
      setFcLocked(false);
    } else if (pendingEdit === 'auditor') {
      setAudLocked(false);
    } else {
      setFcLocked(false);
    }
    setPendingEdit(null);
  }

  function save() {
    if (fcVisible) row.pokok = parseAmount(fcVal);
    if (audVisible) row.pokokAuditor = parseAmount(audVal);

    // After the Auditor submits: if still > 10%, keep the pop-up open and
    // reveal the video-evidence box (first save only). The next Simpan closes.
    if (videoNeeded(row) && !videoShown) {
      setVideoShown(true);
      if (audVisible) setAudLocked(true);
      return;
    }
    onClose();
  }

  function videoChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    row.video = f.name;
    setVideoName(f.name);
    setVideoUrl(URL.createObjectURL(f));
  }

  const lockedInputCls = 'bg-slate-100 text-slate-500 cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-800 text-[15px] uppercase tracking-wide">
            🌱 Plot {row.plot}
            <span className="block text-[10px] text-slate-400 tracking-widest">
              {cfg.label ? `${nurseryKey} · ${cfg.label}` : nurseryKey}
            </span>
          </h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 text-xl cursor-pointer">
            ×
          </button>
        </div>

        {/* FC amount shown as a tappable info line inside the Auditor stage */}
        {audVisible && !fcRevealed && (
          <button
            onClick={() => setPendingEdit('fc-reveal')}
            className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3 text-left cursor-pointer"
          >
            <span className="text-[12px] font-bold text-slate-500">
              Pokok Inang (Field Conductor) <em className="not-italic text-slate-400">· {t('cull.tapToEdit')}</em>
            </span>
            <b className="text-slate-800">{fmtNum(row.pokok)}</b>
          </button>
        )}

        {/* live before / after culling rate */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{t('cull.rateNow')}</span>
            <span className={`font-black ${beforeRate > 0.1 ? 'text-rose-600' : 'text-slate-800'}`}>
              {fmtPct(beforeRate)}
            </span>
          </div>
          <div className="border-t border-dashed border-slate-200 my-2.5" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{t('cull.rateNew')}</span>
            <span className={`font-black text-lg ${afterRate > 0.1 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {fmtPct(afterRate)}
            </span>
          </div>
          <div
            className={`mt-2 text-center text-[11px] font-black rounded-lg py-1.5 ${
              !hasInput || Math.abs(diff) <= 0.00001
                ? 'bg-slate-100 text-slate-400'
                : diff > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-600'
            }`}
          >
            {!hasInput
              ? `– ${t('cull.enterValue')}`
              : diff > 0.00001
                ? `▼ ${fmtPct(diff)} ${t('cull.lower')}`
                : diff < -0.00001
                  ? `▲ ${fmtPct(-diff)} ${t('cull.higher')}`
                  : `– ${t('cull.noChange')}`}
          </div>
        </div>

        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
          <span className="text-[12px] font-bold text-amber-800">{t('cull.target')}</span>
          <b className="text-amber-900">{fmtNum(targetPokok(row))}</b>
        </div>

        {fcVisible && (
          <div className="mb-3">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {t('cull.fcAmount')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="0"
              value={fcVal}
              readOnly={fcLocked}
              onClick={() => fcLocked && setPendingEdit('fc')}
              onChange={(e) => setFcVal(e.target.value)}
              className={`w-full border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 ${
                fcLocked ? lockedInputCls : 'bg-white text-slate-800'
              }`}
            />
            {fcLocked && (
              <button
                onClick={() => setPendingEdit('fc')}
                className="mt-1.5 text-[11px] font-bold text-slate-500 hover:text-emerald-700 cursor-pointer"
              >
                🔒 {t('cull.editAmount')}
              </button>
            )}
          </div>
        )}

        {audVisible && (
          <div className="mb-3">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {t('cull.auditorAmount')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="0"
              value={audVal}
              readOnly={audLocked}
              onClick={() => audLocked && setPendingEdit('auditor')}
              onChange={(e) => setAudVal(e.target.value)}
              className={`w-full border border-slate-300 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 ${
                audLocked ? lockedInputCls : 'bg-white text-slate-800'
              }`}
            />
            {audLocked && (
              <button
                onClick={() => setPendingEdit('auditor')}
                className="mt-1.5 text-[11px] font-bold text-slate-500 hover:text-emerald-700 cursor-pointer"
              >
                🔒 {t('cull.editAmount')}
              </button>
            )}
          </div>
        )}

        {pendingEdit && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 mb-3">
            <p className="text-[12px] font-bold text-rose-800 mb-2.5">{t('cull.editConfirm')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingEdit(null)}
                className="flex-1 bg-white border border-slate-300 text-slate-600 font-black text-[11px] uppercase tracking-widest rounded-xl py-2.5 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmEdit}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl py-2.5 cursor-pointer"
              >
                {t('cull.yesEdit')}
              </button>
            </div>
          </div>
        )}

        {videoShown && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3">
            <div className="text-[11px] font-black text-blue-800 uppercase tracking-wide mb-2">
              {t('cull.videoLabel')}
            </div>
            <label className="block text-center bg-blue-600 hover:bg-blue-700 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3 cursor-pointer">
              🎥 {t('cull.videoBtn')}
              <input type="file" accept="video/*" capture="environment" onChange={videoChosen} hidden />
            </label>
            {videoName && (
              <div className="text-[11px] font-bold text-blue-700 mt-2">
                ✓ {videoUrl ? t('cull.videoReady') : t('cull.videoDone')}: {videoName}
              </div>
            )}
            {videoUrl && <video src={videoUrl} controls playsInline className="w-full rounded-lg mt-2" />}
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-slate-300 text-slate-600 font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3.5 transition-colors cursor-pointer"
          >
            {t('cull.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
