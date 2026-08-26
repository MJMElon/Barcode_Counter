/*
 * The worker portal's data layer.
 *
 * A worker signs in with the PIN on their row of the Payroll register, not
 * with an e-mail account, so there is no Supabase session and no
 * `authenticated` role. Every call below is therefore an RPC —
 * shared/create_worker_portal.sql in the office repository — and every one of
 * those functions starts by turning the session token back into a worker
 * before it does anything.
 *
 * That is the whole security model, and it is worth stating plainly: the
 * phone holds a token and nothing else. It cannot read the worker table, it
 * cannot read anybody's PIN, and it cannot reach a plot outside its boundary,
 * because none of those things are decided here. They are decided in the
 * database, where an app that has been tampered with cannot argue with them.
 */

import { supabase } from '../lib/supabase.js';

/* Where the token lives between visits. A worker opens this on the same
   phone every morning and should not be asked for a PIN each time. */
const TOKEN_KEY = 'mjm_worker_token';

export function savedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function keepToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    /* a browser with storage switched off still works, just not tomorrow */
  }
}

/* PostgREST hands a RAISE EXCEPTION back with the message in `message`. The
   messages in create_worker_portal.sql are written to be read by the person
   holding the phone — "PIN not recognised", "plot B7 is outside your
   boundary" — so they are shown as they are rather than translated into
   something vaguer. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong');
  return data;
}

/* An identity is only an identity if it carries a token and a worker.
   Anything else — an empty array from a misrouted request, an object from a
   half-applied migration, a proxy's idea of a helpful response — is refused
   here rather than being handed on. Without this check a reply of `[]` is
   truthy enough to sign somebody in as nobody: the portal opens, the name is
   blank and every module is switched off, which reads as "the office has not
   set you up yet" rather than as the fault it is. */
function asIdentity(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!data.token || !data.worker || !data.worker.name) return null;
  return data;
}

export async function signIn(pin) {
  const who = asIdentity(unwrap(await supabase.rpc('worker_signin', { p_pin: String(pin || '').trim() })));
  if (!who) throw new Error('The office answered, but not with a sign-in. Try again.');
  return who;
}

/** The worker this token belongs to, or null when it has expired or been
    signed out. Null is a normal answer here, not a failure. */
export async function whoami(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc('worker_whoami', { p_token: token });
  if (error) throw new Error(error.message || 'Could not reach the office');
  return asIdentity(data);
}

export async function signOut(token) {
  if (!token) return;
  try {
    await supabase.rpc('worker_signout', { p_token: token });
  } catch (e) {
    /* The phone forgets the token either way — a sign-out that could not
       reach the office must still sign the worker out of the phone. */
  }
}

export async function plots(token) {
  return unwrap(await supabase.rpc('worker_plots', { p_token: token })) || [];
}

export async function plotBatches(token) {
  return unwrap(await supabase.rpc('worker_plot_batches', { p_token: token })) || [];
}

export async function submitMaintenance(token, payload) {
  return unwrap(await supabase.rpc('worker_submit_maint', { p_token: token, p_payload: payload }));
}

export async function myRecords(token, limit = 60) {
  return unwrap(await supabase.rpc('worker_my_records', { p_token: token, p_limit: limit })) || [];
}

export async function roster(token) {
  return unwrap(await supabase.rpc('worker_roster', { p_token: token })) || [];
}

export async function setPortal(token, workerId, portal) {
  return unwrap(
    await supabase.rpc('worker_set_portal', {
      p_token: token,
      p_worker_id: workerId,
      p_portal: portal,
    })
  );
}

/* ── Reading a boundary ─────────────────────────────────────────────────
   The same shape the database uses: null means "everything", an array means
   exactly those, and an empty array means nothing. Kept here as helpers so
   the Settings screen and the Home screen describe a boundary the same way.  */

export const boundaryAll = (list) => list === null || list === undefined;

export function describeBoundary(boundary, t) {
  const b = boundary || {};
  const nurseries = b.nurseries;
  const plots_ = b.plots;
  if (boundaryAll(nurseries) && boundaryAll(plots_)) return t('wk.boundAll');
  const parts = [];
  if (!boundaryAll(nurseries)) {
    parts.push(nurseries.length ? nurseries.join(', ') : t('wk.boundNone'));
  }
  if (!boundaryAll(plots_)) {
    parts.push(plots_.length ? plots_.join(', ') : t('wk.boundNone'));
  }
  return parts.join(' · ');
}
