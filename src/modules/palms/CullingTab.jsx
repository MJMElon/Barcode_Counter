import { useMemo, useState } from 'react';
import {
  NURSERIES as CULL_NURSERIES,
  cullingRate,
  fmtNum,
  fmtPct,
  getSessionData,
  persistSessionData,
  videoNeeded,
} from './cullingData.js';
import { cullingScopePlots, prettyD, todayStr } from './data.js';
import { PURPOSE_CULLING, TO_AUDITOR, TO_HQ, addRequest, loadRequests, sentToday } from './requests.js';

// Culling Calculator — lives inside PALMS as its third tab (it used to be a
// standalone module). Only plots whose current PALMS activity is Saringan
// Anak Bibit, Tunggu buat culling, Culling or Pengambilan are listed.
// Flow: tap Pokok Inang to record amounts — Field Conductor first; a Site
// Auditor second entry unlocks while the rate stays above 10%; video
// evidence is requested when even the Auditor amount leaves it above 10%.
export default function CullingTab({ t, staffName, flash, nurseryKeys }) {
  const data = useMemo(() => getSessionData(), []);
  const [nursery, setNursery] = useState(() => nurseryKeys[0] || 'BNN');
  const [editing, setEditing] = useState(null); // plot row index in the modal
  const [asking, setAsking] = useState(null); // plot awaiting send confirmation
  const [reqs, setReqs] = useState(() => loadRequests());
  const [, setTick] = useState(0); // re-render after mutating session data
  const refresh = () => setTick((n) => n + 1);
  const today = todayStr();

  // Plots currently at a culling-related stage in PALMS.
  const scope = useMemo(() => cullingScopePlots(), [nursery]);
  const rows = data[nursery].filter((r) => scope.has(r.plot));

  return (
    <>
      {/* Header: title + nursery picker, like the entry tab */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
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
            {nurseryKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-6 text-center text-sm font-bold">
          {t('cull.noPalmsPlots')}
        </div>
      ) : (
        <>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          {/* One layout everywhere. The columns are percentages and the
              padding and type scale down on a phone, so the same table fits
              360px without scrolling sideways. */}
          <div>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[26%]" />
                <col className="w-[22%]" />
                <col className="w-[38%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wide sm:tracking-widest">
                  {/* Transplant and Baki stay in the data (the rate needs
                      them) but are deliberately not shown to the user. */}
                  <th className="px-1.5 sm:px-5 py-2.5 sm:py-3.5 text-left">Plot</th>
                  <th className="px-1 sm:px-5 py-2.5 sm:py-3.5 text-center">Pokok Inang</th>
                  <th className="px-1 sm:px-5 py-2.5 sm:py-3.5 text-center">{t('cull.rate')}</th>
                  <th className="px-1 sm:px-5 py-2.5 sm:py-3.5 text-center">{t('cull.action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const { rate, hot, act, sendTo, sent } = derive(row, reqs, today, t);
                  return (
                    <tr key={row.plot} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-1.5 sm:px-5 py-2.5 sm:py-3.5 align-middle font-black text-slate-800 text-[13px] sm:text-sm">
                        {row.plot}
                      </td>
                      <td className="px-1 sm:px-5 py-2.5 sm:py-3.5 align-middle text-center">
                        <button
                          onClick={() => setEditing(idx)}
                          className={`w-full sm:w-auto sm:min-w-[92px] rounded-lg sm:rounded-xl px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-black tabular-nums leading-tight transition-colors cursor-pointer ${
                            row.pokok === null
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {row.pokok === null ? (
                            <>
                              <span className="sm:hidden">{t('cull.fillInShort')}</span>
                              <span className="hidden sm:inline">{t('cull.fillIn')}</span>
                            </>
                          ) : (
                            fmtNum((row.pokok || 0) + (row.pokokAuditor || 0))
                          )}
                        </button>
                      </td>
                      <td className="px-1 sm:px-5 py-2.5 sm:py-3.5 align-middle text-center">
                        <span
                          className={`inline-block sm:min-w-[68px] rounded-full px-1.5 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-black tabular-nums border ${
                            hot
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                          }`}
                        >
                          {fmtPct(rate)}
                        </span>
                      </td>
                      <td className="px-1 sm:px-5 py-2.5 sm:py-3.5 align-middle text-center">
                        {act}
                        {sendTo &&
                          (sent ? (
                            <div className="mt-1 text-[10px] font-black text-emerald-600 uppercase tracking-wide">
                              ✓ {sendTo === TO_HQ ? t('cull.sentHQ') : t('cull.sent')}
                            </div>
                          ) : (
                            <button
                              onClick={() => setAsking({ row, to: sendTo })}
                              className={`mt-1.5 w-full text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-wider rounded-lg px-1 sm:px-2 py-1.5 cursor-pointer ${
                                sendTo === TO_HQ
                                  ? 'bg-amber-600 hover:bg-amber-700'
                                  : 'bg-slate-800 hover:bg-slate-900'
                              }`}
                            >
                              <span className="sm:hidden">
                                {sendTo === TO_HQ ? t('cull.sendHQShort') : t('cull.sendAuditorShort')}
                              </span>
                              <span className="hidden sm:inline">
                                {sendTo === TO_HQ ? t('cull.sendHQ') : t('cull.sendAuditor')}
                              </span>
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* What has been raised for the Site Auditor */}
      {reqs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{t('cull.reqTitle')}</h3>
          </div>
          {/* Phone: one stacked line per request, so nothing scrolls sideways */}
          <div className="sm:hidden divide-y divide-slate-100">
            {reqs.slice(0, 12).map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-black text-slate-800 text-[13px]">
                    {r.plot} · {r.to === TO_HQ ? t('cull.toHQ') : t('cull.toAuditor')}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 truncate">
                    {r.purpose} · {r.by || '—'}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-bold text-slate-500">{prettyD(r.at)}</div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-3 sm:px-5 py-2 sm:py-3">{t('cull.reqDate')}</th>
                  <th className="px-3 sm:px-5 py-2 sm:py-3">Plot</th>
                  <th className="px-3 sm:px-5 py-2 sm:py-3">{t('cull.reqTo')}</th>
                  <th className="px-3 sm:px-5 py-2 sm:py-3">{t('cull.reqPurpose')}</th>
                  <th className="px-3 sm:px-5 py-2 sm:py-3">{t('cull.reqBy')}</th>
                </tr>
              </thead>
              <tbody>
                {reqs.slice(0, 12).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-slate-600">{prettyD(r.at)}</td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-black text-slate-800">{r.plot}</td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-slate-600">
                      {r.to === TO_HQ ? t('cull.toHQ') : t('cull.toAuditor')}
                    </td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-slate-600">{r.purpose}</td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-slate-500">{r.by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {asking && (
        <SendRequestModal
          row={asking.row}
          to={asking.to}
          nurseryKey={nursery}
          date={today}
          by={staffName}
          t={t}
          onClose={() => setAsking(null)}
          onConfirm={() => {
            const r = asking.row;
            const rate = cullingRate(r.balance, r.pokok, r.pokokAuditor, r.transplant);
            const { list, added } = addRequest({
              plot: r.plot,
              nursery,
              purpose: PURPOSE_CULLING,
              to: asking.to,
              by: staffName || 'FC',
              at: today,
              // HQ needs the figures behind the decision, not just the plot.
              details:
                asking.to === TO_HQ
                  ? { transplant: r.transplant, balance: r.balance, rate: fmtPct(rate), video: r.video || null }
                  : null,
            });
            setReqs(list);
            setAsking(null);
            if (flash) flash(added ? t('cull.sentToast', { p: r.plot }) : t('cull.alreadySent', { p: r.plot }));
          }}
        />
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

// Rate, colour and the action wording for one plot.
//  rate <= 10%                         -> green  (transfer seedling + drone)
//  rate > 10% AND auditor has entered  -> amber  (tell HQ)
//  rate > 10% AND only FC has entered  -> red    (wait for Site Auditor)
//  rate > 10% AND nothing entered yet  -> neutral placeholder
//
// Two things can be raised, and neither happens on its own — both need the
// Field Conductor to press the button and confirm:
//   the drone request goes to the Site Auditor,
//   'Sila bagitahu HQ' goes to HQ, carrying the plot's figures and video.
// "Tunggu Site Auditor" raises nothing: the auditor still has to come and do
// their own count. Once that count brings the rate under 10% the plot moves
// to the drone request and becomes sendable again.
function derive(row, reqs, today, t) {
  const rate = cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant);
  const hot = rate > 0.1;
  let act;
  let sendTo = null;
  if (!hot) {
    sendTo = TO_AUDITOR;
    act = (
      <span className="text-emerald-700 font-bold text-[10px] sm:text-[11px] leading-snug">
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
    sendTo = TO_HQ;
    act = <span className="text-amber-600 font-bold text-[10px] sm:text-[11px] leading-snug">{t('cull.actHQ')}</span>;
  } else if (row.pokok !== null) {
    act = <span className="text-rose-600 font-bold text-[10px] sm:text-[11px] leading-snug">{t('cull.actWait')}</span>;
  } else {
    act = <span className="text-slate-300 font-bold">—</span>;
  }
  const sent = sendTo ? sentToday(reqs, row.plot, today, sendTo) : null;
  return { rate, hot, act, sendTo, sent };
}

// Confirmation before anything reaches the Site Auditor: it shows exactly
// what will be sent — the request date, the plot and the purpose, which for
// anything raised here is always culling.
function SendRequestModal({ row, to, nurseryKey, date, by, t, onClose, onConfirm }) {
  const hq = to === TO_HQ;
  const rate = cullingRate(row.balance, row.pokok, row.pokokAuditor, row.transplant);
  // HQ is being asked to make a judgement, so it gets the figures behind the
  // rate and the video, not just the plot number.
  const lines = [
    [t('cull.reqDate'), prettyD(date)],
    ['Plot', row.plot],
    [t('cull.reqPurpose'), PURPOSE_CULLING],
    [t('cull.reqBy'), by || 'FC'],
  ];
  if (hq) {
    lines.push(
      [t('cull.transplant'), fmtNum(row.transplant)],
      [t('cull.balance'), fmtNum(row.balance)],
      [t('cull.rate'), fmtPct(rate)],
      [t('cull.videoField'), row.video || t('cull.noVideo')]
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl">
        <h3 className="font-black text-slate-800 text-[15px] uppercase tracking-wide mb-3">
          {hq ? t('cull.confirmSendHQTitle') : t('cull.confirmSendTitle')}
        </h3>

        <dl className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 mb-4">
          {lines.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{k}</dt>
              <dd className="text-[13px] font-black text-slate-800 text-right">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-slate-300 text-slate-600 font-black text-[12px] uppercase tracking-widest rounded-xl py-3 cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-black text-[12px] uppercase tracking-widest rounded-xl py-3 cursor-pointer ${
              hq ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {t('cull.confirmSend')}
          </button>
        </div>
      </div>
    </div>
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
    persistSessionData();

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
    persistSessionData();
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
