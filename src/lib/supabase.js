import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Every row of a query, a page at a time.
 *
 * Supabase caps one request at 1000 rows. The inventory ledger is far longer
 * than that, and a partial read does not fail — it quietly returns a balance
 * built from whichever movements happened to come back first, which is how a
 * plot's batches came to disagree with the office movement report. Page until
 * the rows run out, the same way that report does.
 *
 * Returns { data, error } like a single query, so callers read the same.
 */
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
