import { supabase } from './supabase.js';

/**
 * Raising a Nelos case from the FC Portal.
 *
 * Nelos is the case system on the main portal (ai.mjmnursery.com), where
 * every module's follow-up work lands on somebody's To-Do list. The portal
 * has its own helper for this — shared/shared_nelos.js, a browser global —
 * but this app is a React bundle on a different domain and cannot load it.
 * It is the same Supabase project, so this writes the same row to the same
 * table instead.
 *
 * THE ROW SHAPE HERE MUST MATCH shared_nelos.js. If a column is added or
 * renamed there, this goes with it: a case raised from the field that the
 * case screen cannot read is worse than no case at all, because the Field
 * Conductor is told it was sent.
 *
 * Never throws. A case that cannot be raised must not take down the screen
 * that raised it — the caller shows the failure and the Field Conductor can
 * try again.
 */

// The statuses that count as "still open" — from shared_nelos.js.
const PENDING = ['open', 'in_progress'];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

/**
 * An open case for the same module, plot and category is the same case being
 * raised again, not a new one. Without this, a Field Conductor who presses
 * the button twice — or comes back to the same plot tomorrow — files a
 * second identical case and the auditor gets a queue of duplicates.
 */
async function findOpenDuplicate({ source, category, plot }) {
  let q = supabase.from('nelos_cases').select('*').in('status', PENDING).eq('source_module', source);
  if (category) q = q.eq('category', category);
  if (plot) q = q.eq('plot_name', plot);
  const { data, error } = await q.limit(1);
  if (error) return null;
  return (data && data[0]) || null;
}

/**
 * Which plots already have an open case, so a screen can say so before
 * somebody raises a second one. Same question findOpenDuplicate() asks,
 * asked once for every plot rather than one at a time.
 *
 * Returns a Set of plot names — empty on any failure, because "we could
 * not check" must read as "no badge", never as "already raised".
 */
export async function openCasePlots({ source = 'scan', category } = {}) {
  try {
    let q = supabase.from('nelos_cases')
      .select('plot_name')
      .in('status', PENDING)
      .eq('source_module', source);
    if (category) q = q.eq('category', category);
    const { data, error } = await q.limit(500);
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data.map((r) => r.plot_name).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}

/**
 * raiseCase({ title, description, category, priority, source, sourceRef,
 *             nursery, plot, batch, by, byId, dedupe })
 *
 * Returns { data, error, deduped }. `data` is the case row, so the caller can
 * quote its case_no back to the person who raised it.
 */
export async function raiseCase(opts) {
  if (!opts || !opts.title) return { data: null, error: new Error('Nelos: title is required') };

  try {
    if (opts.dedupe) {
      const existing = await findOpenDuplicate(opts);
      if (existing) return { data: existing, error: null, deduped: true };
    }

    const row = {
      title: String(opts.title).slice(0, 300),
      description: opts.description || null,
      category: opts.category || null,
      priority: PRIORITIES.includes(opts.priority) ? opts.priority : 'normal',
      status: 'open',
      /* 'scan' is the FC Portal's key in nelos_modules, and every other
         part of Nelos spells it that way — SOURCE_LABEL, the module
         filter, and nelos_routes, whose source_module is a foreign key
         to that table.

         This used to default to 'fc_portal', which is not a module key
         anywhere. No route row could exist for it (the foreign key
         forbids one), so nelos_route_case() found no rule and fell
         through to its last line — assigned_module := source_module —
         and every case raised here was assigned straight back to the
         people who raised it. That is the "PIC shows FC Portal" the
         case list was reporting. */
      source_module: opts.source || 'scan',
      source_ref: opts.sourceRef || null,
      nursery_name: opts.nursery || null,
      plot_name: opts.plot || null,
      batch_name: opts.batch || null,
      raised_by: opts.by || null,
      raised_by_id: opts.byId || null,
    };

    const { data, error } = await supabase.from('nelos_cases').insert([row]).select().single();
    if (error) return { data: null, error };

    // The opening description also lands in the thread, so the case page
    // reads as one conversation from its first line — same as the portal's
    // own helper does it.
    if (opts.description) {
      await supabase
        .from('nelos_case_comments')
        .insert([
          {
            case_id: data.id,
            body: opts.description,
            kind: 'comment',
            author_name: opts.by || null,
            author_id: opts.byId || null,
          },
        ])
        .then((r) => r, () => ({}));
    }

    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
