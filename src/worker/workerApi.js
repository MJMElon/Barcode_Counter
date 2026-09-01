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

/**
 * A worker who is not on the register yet, putting themselves on it.
 *
 * Name and PIN, and nothing else — everything that decides what they can see
 * is the office's to fill in afterwards. The row this makes has no nursery
 * and no section, so it lands in the Worker System board's "Waiting to be
 * allocated" strip, and until somebody files it there the database answers
 * every question about it with nothing: no modules, no plots. See
 * shared/RUN_ME_worker_signup.sql in the office repository, which says at
 * more length why a door open to the world has to work that way.
 */
export async function signUp(name, pin) {
  return unwrap(await supabase.rpc('worker_signup', { p_name: name, p_pin: pin }));
}

export async function submitMaintenance(token, payload) {
  return unwrap(await supabase.rpc('worker_submit_maint', { p_token: token, p_payload: payload }));
}

/**
 * A ticket to upload photos with.
 *
 * The one place this portal is allowed to write a file rather than a row, and
 * it is worth saying why it needs a ticket at all. A worker holding a PIN is
 * `anon`, and the anon key is printed in the app bundle — so a storage rule
 * that lets `anon` write to the documents bucket lets ANYBODY write to it.
 * That is why the photos switch sat stored-but-not-obeyed for so long.
 *
 * The ticket is the way round it: a random UUID, handed over only for a valid
 * token whose photos switch is on, good for ten minutes and for one folder —
 * worker_photos/<ticket>/ — and for nothing else in the bucket. The upload
 * goes in there and the ticket is burnt straight after, so in practice the
 * door is open for about as long as it takes to send two pictures.
 *
 * See shared/RUN_ME_worker_photos.sql in the office repository, which says
 * all of this at greater length and also says what it does not defend
 * against.
 *
 * Raises when the office has photos switched off for this worker. That is a
 * refusal, not a failure, and the caller has to tell them rather than
 * recording the job with the pictures quietly missing.
 */
export async function photoTicket(token) {
  return unwrap(await supabase.rpc('worker_photo_ticket', { p_token: token }));
}

/** Burn a ticket once the photos are up. Best effort — it expires anyway. */
export async function photoDone(token, ticket) {
  try {
    await supabase.rpc('worker_photo_done', { p_token: token, p_ticket: ticket });
  } catch (e) {
    /* ten minutes from now it is dead regardless */
  }
}

/**
 * One finished job's walked track.
 *
 * Asked for a record at a time, when somebody opens that job and wants to see
 * the line. The list call deliberately leaves the track out — see
 * shared/RUN_ME_worker_track_view.sql, which says why at more length: two
 * thousand records with a thousand points each is tens of megabytes down a
 * nursery's signal to draw a list that only ever shows "820 m".
 *
 * Answers null for a job recorded without a walk, and for a plot outside the
 * boundary. Both mean "there is no line to draw" as far as the screen is
 * concerned, and neither is a fault.
 */
export async function maintTrack(token, id) {
  return unwrap(await supabase.rpc('worker_maint_track', { p_token: token, p_id: id }));
}

export async function myRecords(token, limit = 60) {
  return unwrap(await supabase.rpc('worker_my_records', { p_token: token, p_limit: limit })) || [];
}

/* Every record inside the boundary, whoever recorded it — what the
   Maintenance board counts. A plot somebody else sprayed this morning is
   done, and a board that only knew this worker's own work would send two
   workers to spray it twice. */
export async function maintRecords(token, limit = 500) {
  return unwrap(await supabase.rpc('worker_maint_records', { p_token: token, p_limit: limit })) || [];
}

/** The office's maintenance plan for the nurseries inside the boundary. */
export async function schedules(token) {
  return unwrap(await supabase.rpc('worker_schedules', { p_token: token })) || [];
}

export async function roster(token) {
  return unwrap(await supabase.rpc('worker_roster', { p_token: token })) || [];
}

/* The colleagues a worker may credit a job to — names only, inside their own
   boundary. A different function from roster() above on purpose: that one is
   behind the Settings module and answers with portal settings and who has a
   PIN, which is not something the tick list on a record form has any business
   knowing. See worker_maint_roster in create_worker_portal.sql. */
export async function maintRoster(token) {
  return unwrap(await supabase.rpc('worker_maint_roster', { p_token: token })) || [];
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
