// Data layer for the Plot Status module. Pure helpers live in helpers.js
// (no imports there, so they stay unit-testable in plain node).

import { supabase } from '../../lib/supabase.js';
import { groupEntriesByPlot } from './helpers.js';

export { allowedNurseries, currentStatus, groupEntriesByPlot, todayStr } from './helpers.js';

// ── Supabase I/O ─────────────────────────────────────────────

export async function loadPlotStatusData() {
  const [plotsRes, stagesRes, entriesRes] = await Promise.all([
    supabase.from('shared_plots').select('nursery_name, plot_name').order('plot_name'),
    supabase.from('nops_plot_status_stages').select('*').order('sort_order').order('name'),
    // Recent history is enough to compute every plot's current stage run.
    supabase
      .from('nops_plot_status_entries')
      .select('plot_name, nursery_name, entry_date, stage_id, stage_name, reported_by, remark')
      .order('entry_date', { ascending: false })
      .limit(5000),
  ]);
  const err = plotsRes.error || stagesRes.error || entriesRes.error;
  if (err) throw err;
  return {
    plots: plotsRes.data || [],
    stages: stagesRes.data || [],
    entriesByPlot: groupEntriesByPlot(entriesRes.data || []),
  };
}

/** One status per plot per day — same-day re-entry overwrites. */
export async function saveStatusEntry({ plot, stage, date, remark, reportedBy }) {
  const { error } = await supabase.from('nops_plot_status_entries').upsert(
    [
      {
        entry_date: date,
        nursery_name: plot.nursery_name || null,
        plot_name: plot.plot_name,
        stage_id: stage.id,
        stage_name: stage.name,
        remark: remark || null,
        reported_by: reportedBy || null,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'plot_name,entry_date' }
  );
  if (error) throw error;
}
