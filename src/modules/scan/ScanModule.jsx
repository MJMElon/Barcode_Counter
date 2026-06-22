import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import TopNav from '../../components/TopNav.jsx';
import {
  loadConsents,
  saveConsents,
  newConsent,
  statusOf,
  downloadBackup,
  importBackup,
} from './store.js';
import {
  ensureAudio,
  beepSuccess,
  beepDuplicate,
  beepComplete,
  beepAlarm,
  vibrate,
} from './audio.js';

const DEDUPE_DEBOUNCE_MS = 800;
const OVER_REPEAT_MS = 1200;

export default function ScanModule() {
  const [consents, setConsents] = useState(() => loadConsents());
  const [activeId, setActiveId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  // Persist whenever consents change.
  useEffect(() => {
    saveConsents(consents);
  }, [consents]);

  const flash = useCallback((text, kind = '') => {
    setToast({ text, kind });
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 1600);
  }, []);

  const active = consents.find((c) => c.id === activeId) || null;

  function addConsent(customer, qty, ref) {
    setConsents((cs) => [...cs, newConsent(customer, qty, ref)]);
    flash('Persetujuan ditambah', 'done');
  }

  async function onImport(replace) {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      const merged = await importBackup(file, consents, replace);
      setConsents(merged);
      flash(`${merged.length} persetujuan diimport`, 'done');
    } catch (e) {
      flash('Import gagal: ' + e.message, 'danger');
    }
    fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#e6edf3]">
      <TopNav title="MJM // SCAN" back="/dashboard" />
      {active ? (
        <Scanner
          consent={active}
          setConsents={setConsents}
          flash={flash}
          onBack={() => setActiveId(null)}
        />
      ) : (
        <ConsentList
          consents={consents}
          onOpen={setActiveId}
          showAdd={showAdd}
          setShowAdd={setShowAdd}
          addConsent={addConsent}
          onBackup={() => {
            downloadBackup(consents);
            flash('Sandaran dimuat turun', 'done');
          }}
          onPickImport={() => fileRef.current?.click()}
          onImport={onImport}
          fileRef={fileRef}
        />
      )}

      {toast && (
        <div
          className={`fixed left-1/2 bottom-6 -translate-x-1/2 px-5 py-3 rounded-xl font-mono text-xs tracking-wider z-50 border ${
            toast.kind === 'danger'
              ? 'border-red-500 text-red-400'
              : toast.kind === 'warn'
              ? 'border-amber-400 text-amber-300'
              : toast.kind === 'done'
              ? 'border-emerald-400 text-emerald-300'
              : 'border-slate-600 text-slate-200'
          } bg-[#111821]`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Consent list view ────────────────────────────────────────
function ConsentList({ consents, onOpen, showAdd, setShowAdd, addConsent, onBackup, onPickImport, onImport, fileRef }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [ref, setRef] = useState('');
  const [importMode, setImportMode] = useState('replace');

  const order = { over: 0, progress: 1, pending: 2, done: 3 };
  const sorted = consents.slice().sort((a, b) => {
    const d = order[statusOf(a)] - order[statusOf(b)];
    return d !== 0 ? d : b.createdAt - a.createdAt;
  });

  function save() {
    const q = parseInt(qty, 10);
    if (!name.trim()) return;
    if (!q || q < 1) return;
    addConsent(name.trim(), q, ref.trim());
    setName('');
    setQty('');
    setRef('');
    setShowAdd(false);
  }

  return (
    <div className="max-w-[560px] mx-auto px-5 py-6">
      <h1 className="font-mono text-2xl font-extrabold tracking-tight">Persetujuan Bertandatangan</h1>
      <p className="text-slate-400 text-sm mb-5">Ketuk pelanggan untuk mula kutipan.</p>

      <div className="grid grid-cols-[1fr_auto] gap-2 mb-4">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-emerald-500 text-[#0a0f14] font-mono font-bold text-xs uppercase tracking-wider rounded-lg px-3 py-3"
        >
          {showAdd ? '× Batal' : '+ Tambah Persetujuan'}
        </button>
        <button
          onClick={onBackup}
          className="bg-[#111821] border border-[#1f2a38] text-[#e6edf3] font-mono text-xs uppercase tracking-wider rounded-lg px-3 py-3"
        >
          Sandaran
        </button>
      </div>

      {showAdd && (
        <div className="bg-[#0f1620] border border-[#1f2a38] rounded-2xl p-4 mb-4">
          <div className="font-mono text-[11px] tracking-[0.3em] text-slate-400 uppercase mb-3">Persetujuan Baru</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 110px' }}>
            <input className="scan-inp" placeholder="Nama pelanggan" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="scan-inp" placeholder="Kuantiti" type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="scan-inp col-span-2" placeholder="Rujukan / nota (pilihan)" value={ref} onChange={(e) => setRef(e.target.value)} />
            <div className="col-span-2 flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 bg-[#111821] border border-[#1f2a38] rounded-lg py-3 font-mono text-xs uppercase">Batal</button>
              <button onClick={save} className="flex-1 bg-emerald-500 text-[#0a0f14] rounded-lg py-3 font-mono text-xs font-bold uppercase">Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <select value={importMode} onChange={(e) => setImportMode(e.target.value)} className="scan-inp" style={{ width: 'auto' }}>
          <option value="replace">Import (Gantikan)</option>
          <option value="merge">Import (Gabung)</option>
        </select>
        <button onClick={onPickImport} className="bg-[#111821] border border-[#1f2a38] rounded-lg px-3 py-2.5 font-mono text-xs uppercase">Pilih Fail</button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={() => onImport(importMode === 'replace')} />
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono text-xs bg-[#0f1620] border border-dashed border-[#1f2a38] rounded-2xl">
            Tiada persetujuan lagi.
          </div>
        ) : (
          sorted.map((c) => {
            const st = statusOf(c);
            const pct = c.qty > 0 ? Math.min(100, (c.unique / c.qty) * 100) : 0;
            const pillText = st === 'done' ? 'SELESAI' : st === 'over' ? 'LEBIH' : st === 'progress' ? 'DALAM PROSES' : 'MENUNGGU';
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
                  <span className="bg-emerald-500 text-[#0a0f14] text-[11px] font-bold rounded-md px-3 py-1 uppercase shrink-0">Mula</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full border mr-1.5 text-[10px] tracking-widest ${
                    st === 'done' ? 'text-emerald-400 border-emerald-600' : st === 'over' ? 'text-red-400 border-red-500' : st === 'progress' ? 'text-amber-300 border-amber-400' : 'border-[#1f2a38]'
                  }`}>{pillText}</span>
                  Kuantiti <b className="text-slate-200">{c.qty}</b> · Diimbas <b className="text-slate-200">{c.unique}</b>
                  {c.over ? <> · Lebih <b className="text-red-400">{c.over}</b></> : null}
                  {c.ref ? ` · ${c.ref}` : ''}
                </div>
                <div className="h-1 bg-[#0a0f14] rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${st === 'over' ? 'bg-red-500' : st === 'done' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: pct + '%' }} />
                </div>
              </button>
            );
          })
        )}
      </div>

      <style>{`.scan-inp{background:#0a0f14;border:1px solid #1f2a38;color:#e6edf3;padding:11px 12px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;outline:none;width:100%;}.scan-inp:focus{border-color:#00ff9d;}`}</style>
    </div>
  );
}

// ── Scanner view ─────────────────────────────────────────────
function Scanner({ consent, setConsents, flash, onBack }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('SEDIA');
  const [last, setLast] = useState('Menunggu imbasan pertama…');
  const qrRef = useRef(null);
  const seenRef = useRef(new Set(consent.seen || []));
  const lastCodeRef = useRef('');
  const lastTimeRef = useRef(0);
  const lastOverRef = useRef(0);
  // Keep a live ref to the consent id so the scan callback always mutates the
  // right record without re-binding the camera.
  const idRef = useRef(consent.id);
  idRef.current = consent.id;

  const remain = Math.max(0, consent.qty - consent.unique);
  const st = statusOf(consent);
  const pct = consent.qty > 0 ? Math.min(100, (consent.unique / consent.qty) * 100) : 0;

  const registerScan = useCallback(
    (rawCode) => {
      const code = String(rawCode).trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < DEDUPE_DEBOUNCE_MS) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;

      if (seenRef.current.has(code)) {
        beepDuplicate();
        vibrate([20, 40, 20]);
        flash('Pendua: ' + code, 'warn');
        return;
      }
      seenRef.current.add(code);

      setConsents((cs) =>
        cs.map((c) => {
          if (c.id !== idRef.current) return c;
          const unique = c.unique + 1;
          const willBeOver = unique > c.qty;
          const time = new Date().toLocaleTimeString();
          const scans = [{ code, time, over: willBeOver }, ...c.scans];
          const next = {
            ...c,
            unique,
            seen: [...c.seen, code],
            scans,
            over: willBeOver ? c.over + 1 : c.over,
          };
          if (willBeOver) {
            setLast('Lebih: ' + code);
            if (Date.now() - lastOverRef.current > OVER_REPEAT_MS) {
              beepAlarm();
              lastOverRef.current = Date.now();
            }
            vibrate([120, 60, 120, 60, 200]);
            flash(`Lebih kuota! ${unique}/${c.qty}`, 'danger');
            next.overFired = true;
          } else {
            setLast('Terkini: ' + code);
            beepSuccess();
            vibrate(40);
          }
          if (!c.completedFired && unique === c.qty) {
            next.completedFired = true;
            next.completedAt = Date.now();
            beepComplete();
            vibrate([80, 60, 80, 60, 200]);
            flash(`Sasaran ${c.qty} dicapai!`, 'done');
          }
          return next;
        })
      );
    },
    [setConsents, flash]
  );

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
      /* fall back to facingMode */
    }
    try {
      await qr.start(cameraConfig, config, registerScan, () => {});
    } catch (e) {
      await qr.start({ facingMode: 'environment' }, config, registerScan, () => {});
    }
    try {
      const track = document.querySelector('#reader video')?.srcObject?.getVideoTracks?.()[0];
      if (track?.applyConstraints) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    } catch (e) {
      /* optional */
    }
    setScanning(true);
    setStatus('MENGIMBAS');
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
    setStatus('SEDIA');
  }

  // Stop the camera on unmount / when leaving the scanner.
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
    <div className="max-w-[560px] mx-auto px-5 py-6">
      <div className="flex items-center gap-2.5 mb-3">
        <button onClick={handleBack} className="bg-[#111821] border border-[#1f2a38] rounded-lg px-3.5 py-2.5 font-mono text-xs uppercase tracking-wider">← Kembali</button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight break-words">{consent.customer}</h2>
          <div className="font-mono text-[11px] text-slate-400">Kuantiti {consent.qty}{consent.ref ? ` · ${consent.ref}` : ''}</div>
        </div>
        <div className={`ml-auto font-mono text-[11px] tracking-wider ${st === 'over' ? 'text-red-400' : st === 'done' ? 'text-amber-300' : scanning ? 'text-emerald-400' : 'text-slate-400'}`}>{status}</div>
      </div>

      <div className="bg-[#0f1620] border border-[#1f2a38] rounded-2xl p-3 mb-3">
        <div id="reader" className="rounded-xl overflow-hidden bg-black min-h-[160px]" />
        <button
          onClick={() => (scanning ? stopCamera() : startCamera().catch((e) => { setStatus('RALAT'); alert('Ralat kamera: ' + (e?.message || e)); }))}
          className="w-full mt-2.5 bg-emerald-500 text-[#0a0f14] font-mono font-bold text-xs uppercase tracking-wider rounded-lg py-3.5"
        >
          {scanning ? 'Henti Kamera' : 'Mula Kamera'}
        </button>
      </div>

      <div className={`bg-[#0f1620] border rounded-2xl px-5 py-4 text-center mb-3 ${st === 'over' ? 'border-red-500' : 'border-[#1f2a38]'}`}>
        <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 uppercase mb-1.5">Seal Diimbas</div>
        <div className={`font-mono text-[56px] font-extrabold leading-none ${st === 'over' ? 'text-red-500' : st === 'done' ? 'text-amber-400' : 'text-emerald-400'}`}>
          {consent.unique}
          <span className="text-[22px] text-slate-500 ml-1">/{consent.qty}</span>
        </div>
        <div className="h-1.5 bg-[#0a0f14] rounded-full overflow-hidden mt-2.5 border border-[#1f2a38]">
          <div className={`h-full ${st === 'over' ? 'bg-red-500' : st === 'done' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: pct + '%' }} />
        </div>
        {st === 'over' && (
          <div className="mt-3 bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 font-mono text-xs">
            LEBIH KUOTA · {consent.unique} / {consent.qty} (lebihan {consent.unique - consent.qty})
          </div>
        )}
        <div className="grid mt-2.5">
          <div className="bg-[#0a0f14] border border-[#1f2a38] rounded-lg px-3 py-2 flex justify-between items-center">
            <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">Baki</span>
            <span className={`font-mono text-lg font-bold ${consent.unique > consent.qty ? 'text-red-400' : 'text-slate-100'}`}>{remain}</span>
          </div>
        </div>
        <div className={`mt-2 font-mono text-xs break-all ${st === 'over' ? 'text-red-400' : 'text-slate-400'}`}>{last}</div>
      </div>

      <div className="bg-[#0f1620] border border-[#1f2a38] rounded-2xl p-5">
        <div className="flex justify-between items-center mb-3">
          <div className="font-mono text-[11px] tracking-[0.3em] text-slate-400 uppercase">Log Imbasan</div>
          <div className="font-mono text-[11px] text-emerald-400">{consent.scans.length} entri</div>
        </div>
        <div className="max-h-[260px] overflow-y-auto font-mono text-xs">
          {consent.scans.length === 0 ? (
            <div className="text-center py-6 text-slate-500">Tiada imbasan</div>
          ) : (
            consent.scans.slice(0, 100).map((s, i) => (
              <div key={i} className="flex justify-between items-center gap-2 py-2 border-b border-[#1f2a38] last:border-0 text-slate-400">
                <span className={`flex-1 break-all ${s.over ? 'text-red-400' : 'text-slate-200'}`}>{s.code}</span>
                {s.over && <span className="text-[9px] text-red-400 tracking-widest uppercase">OVER</span>}
                <span className="text-[10px] shrink-0">{s.time}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
