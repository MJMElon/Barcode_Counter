import { useMemo, useState } from 'react';
import {
  NURSERIES as CULL_NURSERIES,
  cullingRate,
  fmtNum,
  fmtPct,
  getSessionData,
  videoNeeded,
} from './cullingData.js';
import { cullingScopePlots } from './data.js';

// Culling Calculator — lives inside PALMS as its third tab (it used to be a
// standalone module). Only plots whose current PALMS activity is Saringan
// Anak Bibit, Tunggu buat culling, Culling or Pengambilan are listed.
// Flow: tap Pokok Inang to record amounts — Field Conductor first; a Site
// Auditor second entry unlocks while the rate stays above 10%; video
// evidence is requested when even the Auditor amount leaves it above 10%.
export default function CullingTab({ t }) {
  const data = useMemo(() => getSessionData(), []);
  const [nursery, setNursery] = useState('BNN');
  const [editing, setEditing] = useState(null); // plot row index in the modal
  const [, setTick] = useState(0); // re-render after mutating session data
  const refresh = () => setTick((n) => n + 1);

  // Plots currently at a culling-related stage in PALMS.
  const scope = useMemo(() => cullingScopePlots(), [nursery]);
  const rows = data[nursery].filter((r) => scope.has(r.plot));

  return (
    <>
      {/* Header: title + nursery picker, like the entry tab */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="font-black text-slate-800 text-[15px]">{t('cull.title')}</h2>
          <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
            {rows.length} plot
          </span>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          {t('pm.nursery')}
          <select
            value={nursery}
            onChange={(e) => setNursery(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
          >
            {Object.keys(CULL_NURSERIES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="text-center text-[11px] font-semibold text-slate-400">
        {t('cull.palmsNote')} {rows.length > 0 && t('cull.tapHint')}
      </div>

      {rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-6 text-center text-sm font-bold">
          {t('cull.noPalmsPlots')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm min-w-[420px]">
              {/* Fixed column widths keep every row on the same grid. */}
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[27%]" />
                <col className="w-[24%]" />
                <col className="w-[33%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {/* Transplant and Baki stay in the data (the rate needs
                      them) but are deliberately not shown to the user. */}
                  <th className="px-3 py-3 text-left">Plot</th>
                  <th className="px-3 py-3 text-center">Pokok Inang</th>
                  <th className="px-3 py-3 text-center">{t('cull.rate')}</th>
                  <th className="px-3 py-3 text-center">{t('cull.action')}</th>
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
                      <span className="text-emerald-700 font-bold text-[11px] leading-snug">
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
                    act = <span className="text-amber-600 font-bold text-[11px] leading-snug">{t('cull.actHQ')}</span>;
                  } else if (row.pokok !== null) {
                    act = <span className="text-rose-600 font-bold text-[11px] leading-snug">{t('cull.actWait')}</span>;
                  } else {
                    act = <span className="text-slate-300 font-bold">—</span>;
                  }
                  return (
                    <tr key={row.plot} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 align-middle font-black text-slate-800">{row.plot}</td>
                      <td className="px-3 py-2.5 align-middle text-center">
                        <button
                          onClick={() => setEditing(idx)}
                          className={`min-w-[92px] rounded-xl px-3 py-1.5 text-[12px] font-black tabular-nums transition-colors cursor-pointer ${
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
                      <td className="px-3 py-2.5 align-middle text-center">
                        <span
                          className={`inline-block min-w-[68px] rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums border ${
                            hot
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                          }`}
                        >
                          {fmtPct(rate)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-center">{act}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== null && rows[editing] && (
        <CullingEntryModal
          nurseryKey={nursery}
          row={rows[editing]}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
          t={t}
        />
      )}
    </>
  );
}

function parseAmount(raw) {
  return raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
}

// Pokok Inang entry pop-up. Field Conductor keys in first; when the saved FC
// amount still leaves the rate above 10% the modal reopens in the Auditor
// stage. Saved amounts lock and need a confirmation before they can change.
// The culling rate itself is deliberately not shown while keying in.
function CullingEntryModal({ nurseryKey, row, onClose, t }) {
  const cfg = CULL_NURSERIES[nurseryKey];

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
