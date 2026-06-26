import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import TopNav from '../../components/TopNav.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  cachedConsents,
  fetchConsents,
  loadProgress,
  saveProgress,
  defaultProgress,
  mergeConsents,
  statusOf,
} from './store.js';
import { ensureAudio, beepSuccess, beepDuplicate, beepComplete, beepAlarm, vibrate } from './audio.js';

const DEDUPE_DEBOUNCE_MS = 800;
const OVER_REPEAT_MS = 1200;

const STATUS_PILL = {
  done: 'scan.statusDone',
  over: 'scan.statusOver',
  progress: 'scan.statusProgress',
  pending: 'scan.statusPending',
};

export default function ScanModule() {
  const { t } = useLang();
  const { staffName } = useAuth();
  const navigate = useNavigate();

  const [serverConsents, setServerConsents] = useState(() => cachedConsents());
  const [progress, setProgress] = useState(() => loadProgress());
  const [activeId, setActiveId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastInfo, setLastInfo] = useState({ key: 'scan.waitingFirst' });

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const seenRef = useRef(new Set());
  const lastCodeRef = useRef('');
  const lastTimeRef = useRef(0);
  const lastOverRef = useRef(0);
  const activeRef = useRef(null);

  const flash = useCallback((text, kind = '') => {
    setToast({ text, kind });
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 1800);
  }, []);

  const consents = useMemo(() => mergeConsents(serverConsents, progress), [serverConsents, progress]);
  const active = consents.find((c) => c.id === activeId) || null;
  activeRef.current = active;

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await fetchConsents();
      setServerConsents(data);
      flash(t('scan.synced', { n: data.length }), 'done');
    } catch (e) {
      flash(t('scan.syncFailed', { msg: e.message }), 'danger');
    } finally {
      setSyncing(false);
    }
  }, [flash, t]);

  // Auto-sync once on first open if we have nothing cached yet.
  useEffect(() => {
    if (serverConsents === null && navigator.onLine) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset dedupe + seen set when switching consent.
  useEffect(() => {
    seenRef.current = new Set(progressRef.current[activeId]?.seen || []);
    lastCodeRef.current = '';
    lastTimeRef.current = 0;
    lastOverRef.current = 0;
    setLastInfo({ key: 'scan.waitingFirst' });
  }, [activeId]);

  const recordScan = useCallback(
    (rawCode) => {
      const a = activeRef.current;
      if (!a) return;
      const code = String(rawCode).trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < DEDUPE_DEBOUNCE_MS) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;

      if (seenRef.current.has(code)) {
        beepDuplicate();
        vibrate([20, 40, 20]);
        flash(t('scan.duplicate', { code }), 'warn');
        return;
      }
      seenRef.current.add(code);

      const cur = progressRef.current[a.id] || defaultProgress();
      const unique = cur.unique + 1;
      const willBeOver = unique > a.qty;
      const time = new Date().toLocaleTimeString();
      const next = {
        ...cur,
        unique,
        seen: [...cur.seen, code],
        scans: [{ code, time, over: willBeOver }, ...cur.scans],
        over: willBeOver ? cur.over + 1 : cur.over,
      };

      if (willBeOver) {
        setLastInfo({ key: 'scan.overItem', vars: { code } });
        if (now - lastOverRef.current > OVER_REPEAT_MS) {
          beepAlarm();
          lastOverRef.current = now;
        }
        vibrate([120, 60, 120, 60, 200]);
        flash(t('scan.overQuota', { u: unique, q: a.qty }), 'danger');
        next.overFired = true;
      } else {
        setLastInfo({ key: 'scan.latest', vars: { code } });
        beepSuccess();
        vibrate(40);
      }
      if (!cur.completedFired && unique === a.qty) {
        next.completedFired = true;
        next.completedAt = Date.now();
        beepComplete();
        vibrate([80, 60, 80, 60, 200]);
        flash(t('scan.targetReached', { q: a.qty }), 'done');
      }

      setProgress((prev) => {
        const map = { ...prev, [a.id]: next };
        saveProgress(map);
        return map;
      });
    },
    [flash, t]
  );

  function issueDO(alNumber) {
    if (alNumber) navigate('/do?al=' + encodeURIComponent(alNumber));
    else navigate('/do');
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#e6edf3]">
      <TopNav title="MJM // SCAN" back="/dashboard" user={staffName} />
      {active ? (
        <Scanner
          consent={active}
          lastInfo={lastInfo}
          onScan={recordScan}
          onBack={() => setActiveId(null)}
          onIssueDO={() => issueDO(active.al_number)}
        />
      ) : (
        <ConsentList consents={consents} loaded={serverConsents !== null} syncing={syncing} onSync={sync} onOpen={setActiveId} />
      )}

      {toast && (
        <div
          className={`fixed left-1/2 bottom-6 -translate-x-1/2 px-5 py-3 rounded-xl font-mono text-xs tracking-wider z-50 border bg-[#111821] ${
            toast.kind === 'danger'
              ? 'border-red-500 text-red-400'
              : toast.kind === 'warn'
              ? 'border-amber-400 text-amber-300'
              : toast.kind === 'done'
              ? 'border-emerald-400 text-emerald-300'
              : 'border-slate-600 text-slate-200'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Consent list view (synced from signed consents) ──────────
function ConsentList({ consents, loaded, syncing, onSync, onOpen }) {
  const { t } = useLang();
  const order = { over: 0, progress: 1, pending: 2, done: 3 };
  const sorted = consents.slice().sort((a, b) => {
    const d = order[statusOf(a)] - order[statusOf(b)];
    return d !== 0 ? d : b.createdAt - a.createdAt;
  });

  return (
    <div className="max-w-[560px] mx-auto px-4 py-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-mono text-xl font-extrabold tracking-tight">{t('scan.brandTitle')}</h1>
        <button
          onClick={onSync}
          disabled={syncing}
          className="shrink-0 bg-emerald-500 text-[#0a0f14] font-mono font-bold text-xs uppercase tracking-wider rounded-lg px-4 py-2.5 disabled:opacity-60"
        >
          {syncing ? t('scan.syncing') : '⟳ ' + t('scan.sync')}
        </button>
      </div>
      <p className="text-slate-400 text-sm mb-4">{t('scan.subtitle')}</p>

      <div className="flex flex-col gap-2.5">
        {sorted.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono text-xs bg-[#0f1620] border border-dashed border-[#1f2a38] rounded-2xl px-4">
            {loaded ? t('scan.noneSynced') : t('common.loading')}
          </div>
        ) : (
          sorted.map((c) => {
            const st = statusOf(c);
            const pct = c.qty > 0 ? Math.min(100, (c.unique / c.qty) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className={`text-left bg-[#0f1620] border rounded-2xl px-4 py-3.5 transition-colors ${
                  st === 'over' ? 'border-red-500' : st === 'done' ? 'border-emerald-600' : 'border-[#1f2a38]'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-semibold text-base break-words">{c.customer}</div>
                  <span className="bg-emerald-500 text-[#0a0f14] text-[11px] font-bold rounded-md px-3 py-1 uppercase shrink-0">{t('scan.start')}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full border mr-1.5 text-[10px] tracking-widest ${
                      st === 'done'
                        ? 'text-emerald-400 border-emerald-600'
                        : st === 'over'
                        ? 'text-red-400 border-red-500'
                        : st === 'progress'
                        ? 'text-amber-300 border-amber-400'
                        : 'border-[#1f2a38]'
                    }`}
                  >
                    {t(STATUS_PILL[st])}
                  </span>
                  {t('scan.qty')} <b className="text-slate-200">{c.qty}</b> · {t('scan.scanned')} <b className="text-slate-200">{c.unique}</b>
                  {c.over ? (
                    <>
                      {' '}
                      · {t('scan.over')} <b className="text-red-400">{c.over}</b>
                    </>
                  ) : null}
                  {c.al_number ? ` · ${c.al_number}` : ''}
                </div>
                <div className="h-1 bg-[#0a0f14] rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${st === 'over' ? 'bg-red-500' : st === 'done' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: pct + '%' }} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Scanner view ─────────────────────────────────────────────
function Scanner({ consent, lastInfo, onScan, onBack, onIssueDO }) {
  const { t } = useLang();
  const [scanning, setScanning] = useState(false);
  const [statusKey, setStatusKey] = useState('ready');
  const qrRef = useRef(null);

  const remain = Math.max(0, consent.qty - consent.unique);
  const st = statusOf(consent);
  const pct = consent.qty > 0 ? Math.min(100, (consent.unique / consent.qty) * 100) : 0;
  const statusText = scanning
    ? st === 'over'
      ? t('scan.statusOver')
      : st === 'done'
      ? t('scan.statusDone')
      : t('scan.scanning')
    : t('scan.' + statusKey);

  async function startCamera() {
    ensureAudio();
    const qr = new Html5Qrcode('reader', { verbose: false });
    qrRef.current = qr;
    const hiRes = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const config = {
      fps: 15,
      qrbox: (vw, vh) => ({
        width: Math.floor(Math.min(vw * 0.95, 460)),
        height: Math.floor(Math.min(vh * 0.7, 140)),
      }),
      aspectRatio: 2.2,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };
    let cameraConfig = { ...hiRes, facingMode: 'environment' };
    try {
      const cams = await Html5Qrcode.getCameras();
      if (cams && cams.length) {
        const back = cams.find((c) => /back|rear|environment/i.test(c.label));
        cameraConfig = { ...hiRes, deviceId: { exact: (back || cams[cams.length - 1]).id } };
      }
    } catch (e) {
      /* fall back */
    }
    try {
      await qr.start(cameraConfig, config, onScan, () => {});
    } catch (e) {
      await qr.start({ facingMode: 'environment' }, config, onScan, () => {});
    }
    try {
      const track = document.querySelector('#reader video')?.srcObject?.getVideoTracks?.()[0];
      if (track?.applyConstraints) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    } catch (e) {
      /* optional */
    }
    setScanning(true);
    setStatusKey('scanning');
  }

  async function stopCamera() {
    try {
      if (qrRef.current?.isScanning) {
        await qrRef.current.stop();
        await qrRef.current.clear();
      }
    } catch (e) {
      /* ignore */
    }
    qrRef.current = null;
    setScanning(false);
    setStatusKey('ready');
  }

  useEffect(() => {
    return () => {
      if (qrRef.current?.isScanning) qrRef.current.stop().catch(() => {});
    };
  }, []);

  async function handleBack() {
    await stopCamera();
    onBack();
  }

  return (
    <div className="max-w-[560px] mx-auto px-4 py-5">
      <div className="flex items-center gap-2.5 mb-3">
        <button onClick={handleBack} className="bg-[#111821] border border-[#1f2a38] rounded-lg px-3 py-2.5 font-mono text-xs uppercase tracking-wider">
          {t('common.back')}
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight break-words">{consent.customer}</h2>
          <div className="font-mono text-[11px] text-slate-400">
            {t('scan.qty')} {consent.qty}
            {consent.al_number ? ` · ${consent.al_number}` : ''}
          </div>
        </div>
        <div className={`ml-auto font-mono text-[11px] tracking-wider ${st === 'over' ? 'text-red-400' : st === 'done' ? 'text-amber-300' : scanning ? 'text-emerald-400' : 'text-slate-400'}`}>
          {statusText}
        </div>
      </div>

      <div className="bg-[#0f1620] border border-[#1f2a38] rounded-2xl p-3 mb-3">
        <div id="reader" className="rounded-xl overflow-hidden bg-black min-h-[160px]" />
        <button
          onClick={() => (scanning ? stopCamera() : startCamera().catch((e) => { setStatusKey('error'); alert(t('scan.cameraError', { msg: e?.message || e })); }))}
          className="w-full mt-2.5 bg-emerald-500 text-[#0a0f14] font-mono font-bold text-xs uppercase tracking-wider rounded-lg py-3.5"
        >
          {scanning ? t('scan.stopCamera') : t('scan.startCamera')}
        </button>
      </div>

      <div className={`bg-[#0f1620] border rounded-2xl px-5 py-4 text-center mb-3 ${st === 'over' ? 'border-red-500' : 'border-[#1f2a38]'}`}>
        <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 uppercase mb-1.5">{t('scan.sealsScanned')}</div>
        <div className={`font-mono text-[56px] font-extrabold leading-none ${st === 'over' ? 'text-red-500' : st === 'done' ? 'text-amber-400' : 'text-emerald-400'}`}>
          {consent.unique}
          <span className="text-[22px] text-slate-500 ml-1">/{consent.qty}</span>
        </div>
        <div className="h-1.5 bg-[#0a0f14] rounded-full overflow-hidden mt-2.5 border border-[#1f2a38]">
          <div className={`h-full ${st === 'over' ? 'bg-red-500' : st === 'done' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: pct + '%' }} />
        </div>
        {st === 'over' && (
          <div className="mt-3 bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 font-mono text-xs">
            {t('scan.overBanner', { u: consent.unique, q: consent.qty, e: consent.unique - consent.qty })}
          </div>
        )}
        <div className="grid mt-2.5">
          <div className="bg-[#0a0f14] border border-[#1f2a38] rounded-lg px-3 py-2 flex justify-between items-center">
            <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">{t('scan.remaining')}</span>
            <span className={`font-mono text-lg font-bold ${consent.unique > consent.qty ? 'text-red-400' : 'text-slate-100'}`}>{remain}</span>
          </div>
        </div>
        <div className={`mt-2 font-mono text-xs break-all ${st === 'over' ? 'text-red-400' : 'text-slate-400'}`}>{t(lastInfo.key, lastInfo.vars)}</div>
      </div>

      <div className="bg-[#0f1620] border border-[#1f2a38] rounded-2xl p-5 mb-3">
        <div className="flex justify-between items-center mb-3">
          <div className="font-mono text-[11px] tracking-[0.3em] text-slate-400 uppercase">{t('scan.scanLog')}</div>
          <div className="font-mono text-[11px] text-emerald-400">{t('scan.entries', { n: consent.scans.length })}</div>
        </div>
        <div className="max-h-[240px] overflow-y-auto font-mono text-xs">
          {consent.scans.length === 0 ? (
            <div className="text-center py-6 text-slate-500">{t('scan.noScans')}</div>
          ) : (
            consent.scans.slice(0, 100).map((s, i) => (
              <div key={i} className="flex justify-between items-center gap-2 py-2 border-b border-[#1f2a38] last:border-0 text-slate-400">
                <span className={`flex-1 break-all ${s.over ? 'text-red-400' : 'text-slate-200'}`}>{s.code}</span>
                {s.over && <span className="text-[9px] text-red-400 tracking-widest uppercase">{t('scan.statusOver')}</span>}
                <span className="text-[10px] shrink-0">{s.time}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Issue DO for the collected seedlings → jumps to the DO module for this AL */}
      <button
        onClick={async () => {
          await stopCamera();
          onIssueDO();
        }}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-sm uppercase tracking-wider rounded-xl py-4 mb-2 flex items-center justify-center gap-2"
      >
        📋 {t('scan.issueDO')}
      </button>
    </div>
  );
}
