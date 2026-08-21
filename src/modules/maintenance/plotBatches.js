/**
 * Which batches are standing in a plot right now.
 *
 * The same arithmetic the Operation Reports movement report does, so the
 * batches a Field Conductor ticks in the field are the ones that report says
 * are there: transplanted in, plus anything transferred in, less the culls,
 * the sales and anything transferred out. A batch whose balance works out to
 * zero has been culled, sold or moved on, and is not offered.
 *
 * No imports, so it stays unit-testable in plain node.
 */

const IN_TYPES  = ['Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone', 'Planted', 'Seeds_Received'];
const OUT_TYPES = ['Damaged_Seeds', '1st_Culling', '2nd_Culling', '3rd_Culling'];

/** A delivery order's plot, read forgivingly: "U15 (UPB PREMIER HYBRID)" → U15. */
export function plotKey(v) {
  return String(v == null ? '' : v).trim().toUpperCase()
    .replace(/^PLOT\s*:?\s*/, '')
    .split(/[\s(,[]/)[0]
    .replace(/[^0-9A-Z-]/g, '');
}

/** A batch by its trailing digits: "MJM-225", "225." and " 225 " are all 225. */
export function batchKey(v) {
  const cleaned = String(v == null ? '' : v).trim().replace(/[^0-9A-Za-z]+$/, '');
  const m = /(\d+)$/.exec(cleaned);
  return m ? String(parseInt(m[1], 10)) : '';
}

/**
 * → Map(plotKey → [{ batch, qty }]), biggest first.
 * `logs` are shared_inventory_logs rows; `dos` are shared_do_records rows.
 */
export function batchesByPlot(logs, dos) {
  const bal = new Map();   // plotKey → Map(batchKey → { batch, qty })
  const add = (plot, batch, n) => {
    const pk = plotKey(plot), bk = batchKey(batch);
    if (!pk || !bk) return;
    if (!bal.has(pk)) bal.set(pk, new Map());
    const m = bal.get(pk);
    if (!m.has(bk)) m.set(bk, { batch, qty: 0 });
    m.get(bk).qty += n;
  };

  for (const l of logs || []) {
    const q = Math.abs(Number(l.quantity_change || 0));
    if (IN_TYPES.includes(l.transaction_type))  add(l.plot_name, l.batch_name, q);
    else if (OUT_TYPES.includes(l.transaction_type)) add(l.plot_name, l.batch_name, -q);
    else if (l.transaction_type === 'Cull3_Transfer') {
      // One log, two sides: plot_name is where they landed, the remark says
      // where they left.
      add(l.plot_name, l.batch_name, q);
      const from = (l.remark || '').match(/From:\s*\[([^\]|]+)\|/);
      if (from) add(from[1], l.batch_name, -q);
    }
  }

  // A delivery order can only take seedlings OFF a plot that already has them.
  // Its batch column is free text, so a mistyped batch must not conjure one up.
  for (const d of dos || []) {
    if (d.status === 'Cancelled' || String(d.remark || '').includes('[CANCELLED]')) continue;
    for (let i = 1; i <= 5; i++) {
      const qty = Number(d[`qty_${i}`] || 0);
      if (!qty) continue;
      const pk = plotKey(d[`plot_${i}`]), bk = batchKey(d[`batch_${i}`]);
      if (!pk || !bk) continue;
      const m = bal.get(pk);
      if (!m || !m.has(bk)) continue;
      m.get(bk).qty -= qty;
    }
  }

  const out = new Map();
  bal.forEach((m, pk) => {
    const list = [...m.values()].filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty);
    if (list.length) out.set(pk, list);
  });
  return out;
}

/** The batches standing in one plot, however its name happens to be spelt. */
export function batchesIn(map, plot) {
  return (map && map.get(plotKey(plot))) || [];
}
