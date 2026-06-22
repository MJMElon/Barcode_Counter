import { supabase } from '../../lib/supabase.js';

// ── Active Approval Letters (AL) ──────────────────────────────
export async function loadActiveALs() {
  const { data, error } = await supabase
    .from('shared_al_orders')
    .select('*')
    .not('status', 'in', '("Cancelled","Collected")')
    .gt('balance_quantity', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// AL numbers that have at least one consent record.
export async function loadConsentALSet() {
  const { data } = await supabase.from('mobile_consent_records').select('al_number');
  const set = new Set();
  (data || []).forEach((c) => set.add(c.al_number));
  return set;
}

// Nursery / breed autocomplete data.
export async function loadDropdownData() {
  const [{ data: plots }, { data: breeds }] = await Promise.all([
    supabase.from('shared_plots').select('plot_name, nursery_name'),
    supabase.from('shared_breeds').select('name'),
  ]);
  return { plots: plots || [], breeds: breeds || [] };
}

export async function loadDOsForAL(alNumber) {
  const { data, error } = await supabase
    .from('shared_do_records')
    .select('*')
    .eq('al_number', alNumber)
    .order('delivery_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadConsentsForAL(alNumber) {
  const { data, error } = await supabase
    .from('mobile_consent_records')
    .select('*')
    .eq('al_number', alNumber)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Auto-incrementing DO number: DO-YYYY-NNNN
export async function generateDONumber() {
  const year = new Date().getFullYear();
  const prefix = `DO-${year}-`;
  const { data } = await supabase
    .from('shared_do_records')
    .select('do_number')
    .ilike('do_number', `${prefix}%`)
    .order('do_number', { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length) {
    const num = parseInt(data[0].do_number.slice(prefix.length).replace(/\D/g, '')) || 0;
    next = num + 1;
  }
  return prefix + String(next).padStart(4, '0');
}

// Upload a DO photo to the `documents` storage bucket; returns a public URL or
// falls back to the raw base64 string if the upload fails.
export async function uploadDOPhoto(base64, alNumber, doNumber) {
  try {
    const filePath = `do_photos/${alNumber}/${doNumber}_${Date.now()}.jpg`;
    const b64 = base64.split(',')[1];
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/jpeg' });
    const { error } = await supabase.storage
      .from('documents')
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) return base64;
    const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
    return data?.publicUrl || base64;
  } catch (e) {
    return base64;
  }
}

// Insert a DO record and deduct the AL balance. Returns the new balance.
export async function saveDORecord(payload, al) {
  const { error } = await supabase.from('shared_do_records').insert([payload]);
  if (error) throw error;
  const newBalance = (al.balance_quantity ?? 0) - (payload.total_qty || 0);
  await supabase.from('shared_al_orders').update({ balance_quantity: newBalance }).eq('id', al.id);
  return newBalance;
}

// Build the plot_n / breed_n / qty_n columns from item rows, mapping a typed
// nursery name back to its plot_name when one matches.
export function buildItemColumns(items, plots) {
  const cols = {};
  items.slice(0, 5).forEach((it, i) => {
    const n = i + 1;
    const matched = plots.find((p) => p.nursery_name?.toLowerCase() === it.nursery?.toLowerCase());
    cols[`plot_${n}`] = matched ? matched.plot_name : it.nursery || null;
    cols[`breed_${n}`] = it.breed || null;
    cols[`qty_${n}`] = it.qty || null;
  });
  return cols;
}

// Extract item rows (nursery/breed/qty) from a DO record's plot_n columns.
export function itemsFromRecord(d, plotMap = {}) {
  const lines = [];
  for (let i = 1; i <= 5; i++) {
    const plot = d[`plot_${i}`];
    const breed = d[`breed_${i}`];
    const qty = parseInt(d[`qty_${i}`]) || 0;
    if (plot || breed || qty > 0) {
      lines.push({ nursery: plotMap[plot] || plot || '—', breed: breed || '—', qty });
    }
  }
  return lines;
}
