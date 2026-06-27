import { useEffect, useMemo, useRef, useState } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import { callGemini, compressImage, DO_SCAN_PROMPT } from '../../lib/gemini.js';
import { generateDONumber, offlineDONumber, buildItemColumns } from './data.js';

const emptyRow = () => ({ key: Math.random().toString(36).slice(2), nursery: '', breed: '', qty: '', ai: false });

// Add / scan a new Delivery Order for the given AL.
// props: al, plots, breeds, photoBase64 (null for manual), onSaved(payload, sigDataUrl), onClose, toast
export default function EntryModal({ al, plots, breeds, photoBase64, initialQty, onSubmit, onSaved, onClose, toast }) {
  const { t } = useLang();
  const [doNumber, setDoNumber] = useState('…');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customer, setCustomer] = useState(al?.customer_name || '');
  const [rows, setRows] = useState(() => {
    const r = emptyRow();
    if (initialQty) r.qty = String(initialQty);
    return [r];
  });
  const [aiState, setAiState] = useState(photoBase64 ? 'loading' : 'manual'); // loading | done | failed | manual
  const [saving, setSaving] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // car-plate + seedlings photo
  const sigRef = useRef(null);
  const photoInputRef = useRef(null);

  async function onPhotoPicked(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressImage(ev.target.result);
      setCapturedPhoto(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // Dropdown options preset from the AI system (shared_plots / shared_breeds).
  const nurseryOptions = useMemo(
    () => [...new Set((plots || []).map((p) => p.nursery_name).filter(Boolean))].sort(),
    [plots]
  );
  const breedOptions = useMemo(
    () => [...new Set((breeds || []).map((b) => b.name).filter(Boolean))].sort(),
    [breeds]
  );
  // Keep a current (e.g. AI-scanned) value selectable even if not in the preset list.
  const withCurrent = (list, val) => (val && !list.includes(val) ? [val, ...list] : list);

  const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const balance = al?.balance_quantity ?? 0;
  const remain = balance - totalQty;
  const customerMatch = customer.trim().toLowerCase() === (al?.customer_name || '').toLowerCase();

  useEffect(() => {
    if (!navigator.onLine) {
      setDoNumber(offlineDONumber());
      return;
    }
    generateDONumber()
      .then(setDoNumber)
      .catch(() => setDoNumber(offlineDONumber()));
  }, []);

  useEffect(() => {
    if (!photoBase64) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await callGemini(photoBase64, 'image/jpeg', DO_SCAN_PROMPT);
        if (cancelled) return;
        const items = (result.items || []).slice(0, 5);
        if (items.length) {
          setRows(items.map((it) => ({ key: Math.random().toString(36).slice(2), nursery: it.nursery || '', breed: it.breed || '', qty: it.quantity || '', ai: true })));
        }
        if (result.date) setDate(result.date);
        if (result.customer_name) setCustomer(result.customer_name);
        setAiState(items.length ? 'done' : 'failed');
      } catch (e) {
        if (!cancelled) setAiState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoBase64]);

  function updateRow(key, field, value) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => (rs.length >= 5 ? (toast(t('do.maxRows')), rs) : [...rs, emptyRow()]));
  }
  function removeRow(key) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== key)));
  }

  async function save() {
    const items = rows
      .map((r) => ({ nursery: r.nursery.trim(), breed: r.breed.trim(), qty: parseInt(r.qty) || 0 }))
      .filter((it) => it.nursery || it.breed || it.qty > 0);
    if (!date) return alert(t('do.selectDate'));
    if (!items.length) return alert(t('do.addItem'));
    if (totalQty <= 0) return alert(t('do.qtyGtZero'));
    if (totalQty > balance) return alert(t('do.exceedsBalance', { t: totalQty, b: balance }));
    if (!sigRef.current?.hasSig()) return alert(t('do.pleaseSign'));

    const sigDataUrl = sigRef.current.toDataURL();
    setSaving(true);

    const payload = {
      do_number: doNumber,
      al_number: al.al_number,
      delivery_date: date,
      total_qty: totalQty,
      remark: al.customer_name,
      status: 'Delivered',
      ...buildItemColumns(items, plots),
    };

    // Persistence (online insert vs offline queue) is handled by the parent.
    let res;
    try {
      res = await onSubmit({ payload, photoBase64: capturedPhoto || photoBase64, al });
    } catch (e) {
      setSaving(false);
      return alert(t('do.saveError', { msg: e.message }));
    }
    setSaving(false);
    onSaved(res.payload, sigDataUrl, res.queued);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6 rounded-t-[24px] flex justify-between items-start" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {photoBase64 ? t('do.aiScanLabel') : t('do.manualLabel')}
            </div>
            <div className="text-xl font-black text-white">{t('do.newDeliveryOrder')}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1">
              <span className="text-white font-black">{al?.al_number || '—'}</span>
              <span className="text-amber-400 mx-2">✦</span>
              <span className="text-slate-300">{al?.customer_name || '—'}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg flex items-center justify-center shrink-0 ml-4">✕</button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {photoBase64 && (
            <div className="rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-50" style={{ maxHeight: 240 }}>
              <img src={photoBase64} alt="DO" className="w-full object-contain" style={{ maxHeight: 240 }} />
            </div>
          )}

          {aiState === 'loading' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🤖</div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{t('do.aiReading')}</div>
            </div>
          )}

          {aiState !== 'loading' && (
            <>
              {aiState === 'failed' && (
                <div className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t('do.aiFailed')}
                </div>
              )}
              {aiState === 'done' && (
                <div className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 uppercase tracking-wider">
                  {t('do.aiComplete')}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('do.doNumber')} <span className="text-blue-500">AUTO</span></label>
                  <input value={doNumber} readOnly className="search-input text-sm font-black bg-blue-50 border-blue-200" style={{ padding: '10px 14px' }} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('do.deliveryDate')}</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="search-input text-sm" style={{ padding: '10px 14px' }} />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('do.customerNameLabel')}</label>
                <div className="flex gap-2 items-center">
                  <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="search-input text-sm flex-1" style={{ padding: '10px 14px' }} />
                  {customer.trim() && (
                    <div className={`shrink-0 text-[10px] font-black px-3 py-2 rounded-xl border ${customerMatch ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                      {customerMatch ? t('do.match') : t('do.mismatch')}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('do.itemsLabel')} <span className="text-slate-300">{t('do.maxRowsNote')}</span></label>
                  {rows.length < 5 && (
                    <button onClick={addRow} className="text-[9px] font-black text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg cursor-pointer uppercase tracking-widest">{t('do.addRow')}</button>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
                  <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest w-6">#</th>
                        <th className="p-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('do.colNursery')}</th>
                        <th className="p-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('do.colBreed')}</th>
                        <th className="p-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest w-20">{t('do.colQty')}</th>
                        <th className="p-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.key}>
                          <td className="p-2 text-center text-[10px] font-black text-slate-400">{i + 1}</td>
                          <td className="p-1.5">
                            <select value={r.nursery} onChange={(e) => updateRow(r.key, 'nursery', e.target.value)} className="search-input text-xs w-full" style={{ padding: '7px 10px' }}>
                              <option value="">{t('do.nurseryPlaceholder')}</option>
                              {withCurrent(nurseryOptions, r.nursery).map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            {r.ai && <span className="text-[9px] text-emerald-600 font-black">✨AI</span>}
                          </td>
                          <td className="p-1.5">
                            <select value={r.breed} onChange={(e) => updateRow(r.key, 'breed', e.target.value)} className="search-input text-xs w-full" style={{ padding: '7px 10px' }}>
                              <option value="">{t('do.breedPlaceholder')}</option>
                              {withCurrent(breedOptions, r.breed).map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-1.5 w-20">
                            <input type="number" min="0" value={r.qty} onChange={(e) => updateRow(r.key, 'qty', e.target.value)} placeholder="0" className="search-input text-xs w-full" style={{ padding: '7px 10px' }} />
                          </td>
                          <td className="p-1.5 w-8 text-center">
                            <button onClick={() => removeRow(r.key)} className="text-slate-300 hover:text-red-500 font-black text-xl leading-none cursor-pointer border-none bg-transparent">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] font-bold text-slate-400 mt-2 text-right">
                  {t('do.totalQtyLabel')} <span className="font-black text-slate-700">{totalQty}</span>
                  &nbsp;·&nbsp; {t('do.balanceLabel')} <span className={`font-black ${remain < 0 ? 'text-red-600' : 'text-blue-700'}`}>{remain}</span>
                </div>
              </div>

              {/* Photo: customer car plate with loaded seedlings */}
              <div className="border-t border-slate-100 pt-5">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('do.photoTitle')}</div>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoPicked} />
                {capturedPhoto ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-200 bg-slate-50">
                    <img src={capturedPhoto} alt="DO photo" className="w-full object-contain" style={{ maxHeight: 220 }} />
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute bottom-2 right-2 text-[10px] font-black uppercase tracking-widest text-white bg-black/60 px-3 py-2 rounded-xl border-none cursor-pointer"
                    >
                      📷 {t('do.retakePhoto')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-xs uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2"
                  >
                    📷 {t('do.takePhoto')}
                  </button>
                )}
                <p className="text-[10px] font-bold text-slate-300 mt-1.5">{t('do.photoHint')}</p>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('do.sigTitle')}</div>
                <p className="text-[10px] font-bold text-slate-300 mb-3">{t('do.sigNote')}</p>
                <SignaturePad ref={sigRef} height={160} />
              </div>

              <div className="flex gap-3 justify-end pt-1 border-t border-slate-100">
                <button onClick={onClose} className="text-[10px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest bg-slate-50 px-5 py-2.5 rounded-full border border-slate-200 cursor-pointer">{t('common.cancel')}</button>
                <button onClick={save} disabled={saving} className="text-[10px] font-black text-white uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 px-7 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-60">
                  {saving ? t('do.saving') : t('do.saveSign')}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
