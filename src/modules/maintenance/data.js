// Data layer for the Maintenance module. Pure helpers live in helpers.js
// (no imports there, so they stay unit-testable in plain node).

import { supabase } from '../../lib/supabase.js';
import { sortRecords, workTypeByKey } from './helpers.js';

export {
  WORK_TYPES,
  allowedNurseries,
  canMaintain,
  sortRecords,
  toCsv,
  todayStr,
  workTypeByKey,
  workTypeLabel,
} from './helpers.js';

/** Raised when the table has not been created yet, so the UI can say which
    SQL to run instead of showing a raw PostgREST error. */
export const SETUP_NEEDED = 'SETUP_NEEDED';

function isMissingTable(error) {
  const m = String((error && error.message) || '');
  return /relation .* does not exist|Could not find the table|schema cache/i.test(m);
}

export async function loadMaintenanceData() {
  const [plotsRes, recRes] = await Promise.all([
    supabase.from('shared_plots').select('nursery_name, plot_name').order('plot_name'),
    // Recent work is all a Field Conductor needs on a phone; the office keeps
    // the full history.
    supabase
      .from('nops_maint_field_records')
      .select('*')
      .order('work_date', { ascending: false })
      .limit(500),
  ]);
  if (plotsRes.error) throw plotsRes.error;
  if (recRes.error) {
    if (isMissingTable(recRes.error)) throw new Error(SETUP_NEEDED);
    throw recRes.error;
  }
  return {
    plots: plotsRes.data || [],
    records: sortRecords(recRes.data || []),
  };
}

/** Create or update one record. `id` present = update. */
export async function saveRecord({ id, plot, workTypeKey, date, qty, chemical, remark, reportedBy }) {
  const wt = workTypeByKey(workTypeKey);
  const row = {
    work_date: date,
    nursery_name: (plot && plot.nursery_name) || null,
    plot_name: plot.plot_name,
    work_type: workTypeKey,
    // The office's own wording, stored alongside, so the two systems can be
    // matched up without re-deriving it there.
    jenis: wt ? wt.jenis : null,
    chemical: chemical || null,
    qty: qty === '' || qty == null ? null : Number(qty),
    remark: remark || null,
    reported_by: reportedBy || null,
    updated_at: new Date().toISOString(),
  };
  const q = id
    ? supabase.from('nops_maint_field_records').update(row).eq('id', id)
    : supabase.from('nops_maint_field_records').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteRecord(id) {
  const { error } = await supabase.from('nops_maint_field_records').delete().eq('id', id);
  if (error) throw error;
}
