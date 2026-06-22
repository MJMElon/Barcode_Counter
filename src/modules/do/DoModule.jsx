import { useEffect, useRef, useState } from 'react';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { AI_SCAN_ENABLED } from '../../config.js';
import { printDO } from '../../lib/pdf.js';
import { compressImage } from '../../lib/gemini.js';
import { loadActiveALs, loadConsentALSet, loadDropdownData } from './data.js';
import ManageModal from './ManageModal.jsx';
import EntryModal from './EntryModal.jsx';

export default function DoModule() {
  const { staffName } = useAuth();
  const [als, setAls] = useState(null);
  const [consentSet, setConsentSet] = useState(new Set());
  const [plots, setPlots] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [manageAL, setManageAL] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [choiceAL, setChoiceAL] = useState(null); // AL awaiting photo/manual choice
  const [entry, setEntry] = useState(null); // { al, photoBase64 }
  const [printPrompt, setPrintPrompt] = useState(null); // { payload, sigDataUrl }
  const cameraRef = useRef(null);

  const flash = (text) => {
    setToast(text);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 3000);
  };

  async function reload() {
    try {
      const [data, set] = await Promise.all([loadActiveALs(), loadConsentALSet()]);
      setAls(data);
      setConsentSet(set);
    } catch (e) {
      setError(e.message);
      setAls([]);
    }
  }

  useEffect(() => {
    reload();
    loadDropdownData().then(({ plots, breeds }) => { setPlots(plots); setBreeds(breeds); }).catch(() => {});
  }, []);

  // Group ALs: search match → consent signed → active pending.
  const lower = query.trim().toLowerCase();
  const groups = (() => {
    if (!als) return [];
    const matched = [], signed = [], pending = [];
    als.forEach((r) => {
      const isMatch = lower.length >= 1 && (
        (r.al_number || '').toLowerCase().includes(lower) ||
        (r.order_number || '').toLowerCase().includes(lower) ||
        (r.customer_name || '').toLowerCase().includes(lower)
      );
      if (isMatch) matched.push(r);
      else if (consentSet.has(r.al_number)) signed.push(r);
      else pending.push(r);
    });
    const g = [];
    if (lower.length >= 1 && matched.length) g.push({ label: '🔍 Search Match', rows: matched, theme: 'amber' });
    if (signed.length) g.push({ label: '✅ Consent Signed — Awaiting Collection', rows: signed, theme: 'emerald' });
    if (pending.length) g.push({ label: '📋 Active AL — Consent Pending', rows: pending, theme: 'blue' });
    return g;
  })();

  const themeMap = {
    amber: { head: 'bg-amber-50 text-amber-700 border-amber-200', bal: 'text-amber-700' },
    emerald: { head: 'bg-emerald-50 text-emerald-700 border-emerald-200', bal: 'text-emerald-700' },
    blue: { head: 'bg-blue-50 text-blue-700 border-blue-200', bal: 'text-blue-700' },
  };

  function openChoice(al) {
    if (AI_SCAN_ENABLED) setChoiceAL(al);
    else setEntry({ al, photoBase64: null }); // no AI → straight to manual entry
  }

  async function onCameraFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const al = choiceAL;
    setChoiceAL(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = await compressImage(ev.target.result);
      setEntry({ al, photoBase64: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function onSaved(payload, sigDataUrl) {
    setEntry(null);
    flash(`DO ${payload.do_number} saved!`);
    reload();
    setRefreshToken((t) => t + 1);
    // Re-open / refresh manage modal for this AL and offer to print.
    const al = (als || []).find((r) => r.al_number === payload.al_number);
    if (al) setManageAL(al);
    setTimeout(() => setPrintPrompt({ payload, sigDataUrl }), 300);
  }

  function doPrint(doRec, sigDataUrl = null) {
    const al = (als || []).find((r) => r.al_number === doRec.al_number) || manageAL || {};
    printDO(doRec, al, staffName, sigDataUrl);
    flash(`${doRec.do_number} printed!`);
  }

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <TopNav title="Issue Collection DO — Sign & Print" back="/dashboard" />
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="dash-card bg-white rounded-[20px] border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,.06)] p-5 sm:p-6">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">🔍 Search Order Number / Customer Name</div>
          <div className="flex gap-3 mb-5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              placeholder="AL No., Order No. or Customer Name…"
            />
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <Legend color="bg-amber-400" text="Search Match" tone="text-amber-700" />
            <Legend color="bg-emerald-500" text="Consent Signed — Awaiting Collection" tone="text-emerald-700" />
            <Legend color="bg-blue-400" text="Active AL — Consent Pending" tone="text-blue-700" />
          </div>

          {error && <div className="text-center py-4 text-red-400 text-xs font-bold">{error}</div>}

          {als === null ? (
            <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-widest">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No active approval letters found</div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>AL No.</th><th>Order #</th><th>Customer</th><th>Qty Ordered</th><th>Balance</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const t = themeMap[g.theme];
                    return (
                      <FragmentRows
                        key={g.label}
                        label={`${g.label} (${g.rows.length})`}
                        headClass={t.head}
                        balClass={t.bal}
                        rows={g.rows}
                        onManage={(al) => setManageAL(al)}
                        onCamera={(al) => openChoice(al)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Manage DOs modal */}
      {manageAL && (
        <ManageModal
          al={manageAL}
          plots={plots}
          refreshToken={refreshToken}
          onAddDO={() => openChoice(manageAL)}
          onPrint={(doRec) => doPrint(doRec)}
          onClose={() => setManageAL(null)}
        />
      )}

      {/* Choice modal: photo vs manual */}
      {choiceAL && (
        <div className="modal-overlay open" onClick={() => setChoiceAL(null)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2">📋</div>
            <div className="font-black text-slate-800 text-lg uppercase tracking-wide mb-1">Add New DO</div>
            <div className="text-xs font-bold text-slate-400 mb-1">{choiceAL.al_number} · {choiceAL.customer_name}</div>
            <div className="text-[11px] font-bold text-slate-300 mb-6">Order: {choiceAL.order_number || '—'}</div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button onClick={() => cameraRef.current?.click()} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-500 transition-all cursor-pointer">
                <span className="text-3xl">📷</span>
                <span className="text-[11px] font-black text-blue-700 uppercase tracking-wide">Take Photo<br /><span className="text-[9px] font-bold text-blue-400 normal-case">AI will scan the doc</span></span>
              </button>
              <button onClick={() => { const al = choiceAL; setChoiceAL(null); setEntry({ al, photoBase64: null }); }} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 hover:border-slate-400 transition-all cursor-pointer">
                <span className="text-3xl">✏️</span>
                <span className="text-[11px] font-black text-slate-600 uppercase tracking-wide">Key in Manually<br /><span className="text-[9px] font-bold text-slate-400 normal-case">Fill form directly</span></span>
              </button>
            </div>
            <button onClick={() => setChoiceAL(null)} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest cursor-pointer border-none bg-transparent">Cancel</button>
          </div>
        </div>
      )}

      {/* Entry (scan/manual) modal */}
      {entry && (
        <EntryModal
          al={entry.al}
          plots={plots}
          breeds={breeds}
          photoBase64={entry.photoBase64}
          toast={flash}
          onSaved={onSaved}
          onClose={() => setEntry(null)}
        />
      )}

      {/* Print prompt */}
      {printPrompt && (
        <div className="modal-overlay open" onClick={() => setPrintPrompt(null)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl mb-3">🖨️</div>
            <div className="font-black text-slate-800 text-lg uppercase tracking-wide mb-1">DO Saved!</div>
            <div className="text-sm font-bold text-slate-500 mb-1">{printPrompt.payload.do_number}</div>
            <div className="text-xs font-bold text-slate-400 mb-6">Print this DO for the customer?</div>
            <div className="flex flex-col gap-3">
              <button onClick={() => { doPrint(printPrompt.payload, printPrompt.sigDataUrl); setPrintPrompt(null); }} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl border-none cursor-pointer">🖨️ Yes — Print PDF</button>
              <button onClick={() => setPrintPrompt(null)} className="w-full py-2.5 text-[10px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">Maybe Later</button>
            </div>
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraFile} />

      {toast && (
        <div className="fixed bottom-6 right-6 text-white px-5 py-3.5 rounded-xl text-[13px] font-bold z-[999] shadow-lg flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#064e3b,#10b981)' }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}

function Legend({ color, text, tone }) {
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${tone}`}>
      <span className={`w-3 h-3 rounded ${color} inline-block`} />
      {text}
    </span>
  );
}

// A group header row plus its data rows.
function FragmentRows({ label, headClass, balClass, rows, onManage, onCamera }) {
  return (
    <>
      <tr><td colSpan={6} className={`py-2 px-4 text-[9px] font-black uppercase tracking-widest border-b ${headClass}`}>{label}</td></tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <td><span className="font-black text-slate-800">{r.al_number || '—'}</span></td>
          <td>{r.order_number || '—'}</td>
          <td>{r.customer_name || '—'}</td>
          <td>{r.quantity_ordered ?? '—'}</td>
          <td><span className={`font-black ${balClass}`}>{r.balance_quantity ?? '—'}</span></td>
          <td className="whitespace-nowrap">
            <button onClick={() => onManage(r)} className="btn-open mr-1">Manage DOs</button>
            <button onClick={() => onCamera(r)} title="Add DO" className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border-none cursor-pointer align-middle">📷</button>
          </td>
        </tr>
      ))}
    </>
  );
}
