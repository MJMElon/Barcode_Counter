import { useEffect, useState } from 'react';
import { loadDOsForAL, loadConsentsForAL, itemsFromRecord } from './data.js';

// Manage DOs for one AL: shows AL details, issued DO records, signed consent
// records, and an entry point to add a new DO.
// props: al, plots, onAddDO(), onPrint(doRec), onClose, refreshToken
export default function ManageModal({ al, plots, onAddDO, onPrint, onClose, refreshToken }) {
  const [dos, setDos] = useState(null);
  const [consents, setConsents] = useState(null);

  const plotMap = {};
  plots.forEach((p) => { plotMap[p.plot_name] = p.nursery_name; });

  useEffect(() => {
    let alive = true;
    setDos(null);
    setConsents(null);
    loadDOsForAL(al.al_number).then((d) => alive && setDos(d)).catch(() => alive && setDos([]));
    loadConsentsForAL(al.al_number).then((c) => alive && setConsents(c)).catch(() => alive && setConsents([]));
    return () => { alive = false; };
  }, [al.al_number, refreshToken]);

  const totalIssued = (dos || [])
    .filter((d) => d.status !== 'Cancelled')
    .reduce((s, d) => s + (parseInt(d.total_qty) || 0), 0);

  const fields = [
    ['AL Number', al.al_number || '—'],
    ['Order Number', al.order_number || '—'],
    ['Customer Name', al.customer_name || '—'],
    ['Purchased Product', al.product_name || '—'],
    ['Qty Ordered', al.quantity_ordered ?? '—'],
    ['Balance to Collect', al.balance_quantity ?? '—'],
  ];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 rounded-t-[24px] flex justify-between items-start" style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)' }}>
          <div>
            <div className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">📋 Delivery Orders</div>
            <div className="text-xl font-black text-white tracking-wide">Manage DOs for {al.al_number}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg flex items-center justify-center shrink-0 ml-4">✕</button>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                <div className={`font-black text-sm leading-snug ${label === 'Balance to Collect' ? 'text-blue-700 text-base' : 'text-slate-800'}`}>{value}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DO Records Issued</div>
              <button onClick={onAddDO} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl border-none cursor-pointer">
                + Add DO
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>Delivery Date</th><th>DO Number</th><th>Nursery</th><th>Breed</th><th>Qty</th><th>Photo / Print</th></tr>
                </thead>
                <tbody>
                  {dos === null ? (
                    <tr><td colSpan={6} className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-widest">Loading…</td></tr>
                  ) : dos.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10"><div className="text-3xl mb-2">📭</div><div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No DOs issued yet for this AL</div></td></tr>
                  ) : (
                    dos.map((d) => {
                      const lines = itemsFromRecord(d, plotMap);
                      const cancelled = d.status === 'Cancelled';
                      const dateFmt = d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('en-MY') : '—';
                      return (
                        <tr key={d.id} className={cancelled ? 'opacity-50' : ''}>
                          <td className="text-slate-500 font-bold whitespace-nowrap">{dateFmt}</td>
                          <td><span className={`font-black ${cancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{d.do_number || '—'}</span></td>
                          <td className="text-slate-600 text-xs">{lines.length ? lines.map((l, i) => <div key={i}>{l.nursery}</div>) : '—'}</td>
                          <td className="text-slate-600 text-xs">{lines.length ? lines.map((l, i) => <div key={i}>{l.breed}</div>) : '—'}</td>
                          <td>{lines.length ? lines.map((l, i) => <div key={i} className="font-black text-emerald-700">{l.qty}</div>) : <span className="font-black text-emerald-700">{d.total_qty ?? '—'}</span>}</td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              {d.image_url ? (
                                <button onClick={() => window.open(d.image_url, '_blank')} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 cursor-pointer bg-slate-50">
                                  <img src={d.image_url} className="w-full h-full object-cover" loading="lazy" alt="doc" />
                                </button>
                              ) : (
                                <span className="text-slate-200 text-xs">—</span>
                              )}
                              <button onClick={() => onPrint(d)} title="Print this DO" className="w-10 h-10 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 flex items-center justify-center cursor-pointer bg-slate-50 text-slate-400 hover:text-emerald-600">
                                🖨️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {dos && dos.length > 0 && (
              <div className="text-[10px] font-bold text-slate-400 mt-2 text-right">
                Total Issued: <span className="font-black text-slate-700">{totalIssued}</span> &nbsp;·&nbsp; Balance to Collect: <span className="font-black text-blue-700">{al.balance_quantity ?? '—'}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">✍️ Signed Consent Records</div>
            {consents === null ? (
              <div className="text-center py-4 text-slate-300 text-xs font-bold uppercase tracking-widest">Loading…</div>
            ) : consents.length === 0 ? (
              <div className="text-center py-5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No consent records for this AL</div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-slate-400">{consents.length} consent(s)</span>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                    Total Consented: {consents.reduce((s, c) => s + (c.consent_qty || 0), 0).toLocaleString()}
                  </span>
                </div>
                {consents.map((c, i) => (
                  <div key={c.id || i} className="bg-white rounded-2xl border border-emerald-200 p-4 mb-3 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Consent #{i + 1}</span>
                        <div className="text-xs font-bold text-slate-500 mt-0.5">
                          {c.created_at ? new Date(c.created_at).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </div>
                      <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">{(c.consent_qty || 0).toLocaleString()} seedlings</span>
                    </div>
                    {c.ai_sticker_count != null && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">🤖 AI Count:</span>
                        <span className="font-black text-blue-700">{c.ai_sticker_count.toLocaleString()}</span>
                      </div>
                    )}
                    {c.photo_url && (
                      <div className="mt-2">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">📷 Sticker Photo</div>
                        <img src={c.photo_url} alt="sticker" className="rounded-xl border border-slate-200" style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                    {c.signature_data && (
                      <div className="mt-2">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">✍️ Signature</div>
                        <img src={c.signature_data} alt="signature" style={{ height: 48, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-6 flex justify-end border-t border-slate-100 pt-5">
          <button onClick={onClose} className="text-[10px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest bg-slate-50 px-6 py-3 rounded-full border border-slate-200 cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
