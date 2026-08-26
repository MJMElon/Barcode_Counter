/* ══════════════════════════════════════════════════════════════════════
   NELOS, IN THE FC PORTAL

   What is waiting for this Field Conductor, and the case they are working
   on, over whatever screen they were on. The portal it belongs to is a
   different site on a different build (ai.mjmnursery.com), so nothing is
   imported from it — what is copied is the DECISIONS, and each of them is
   named in src/lib/nelos.js so the two can be checked against each other.

   Grouped the way the day is worked, the same as every other Nelos surface:

     ⏰ Overdue          late, and pinned to the top however far you scroll
     Assigned to me      my name on it, not yet late
     Other pending       the rest of this portal's queue

   A case opens in place — start it, resolve it, close it, comment on it —
   because a Field Conductor standing in a plot is not going to leave for
   another site to say "done". The writes are nelos_case.html's, move for
   move, so a case settled here is indistinguishable from one settled there.

   Everything fails soft: the case log is not this app's, and a portal that
   cannot reach it must still scan barcodes.
   ══════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isOverdue, pendingCases } from '../lib/nelos.js';
import NelosNewCase from './NelosNewCase.jsx';

const MODULE = 'scan';                 // this portal's key in nelos_modules

const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
const SOURCE_LABEL = {
  operation: 'Seedling Stock',
  nursery_ops: 'HQ Operation',
  scan: 'FC Portal',
  mobile: 'Admin Portal',
  audit: 'Audit Portal',
  npayroll: 'Payroll',
  nelos: 'Nelos',
};
const DOT = { urgent: 'bg-rose-600', high: 'bg-orange-500', normal: 'bg-sky-500', low: 'bg-slate-400' };

/* A full date, for "Created …". fmtDay below is the DUE-date format and
   deliberately has no year — a due date is always near — but the day a case
   was raised can be months back, and "20 Aug" then says the wrong thing. */
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-MY',
      { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
};

const fmtDay = (d) => {
  if (!d) return '';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
  } catch (e) {
    return d;
  }
};
const fmtStamp = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-MY',
      { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};
const initials = (n) =>
  String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ── One case, opened ────────────────────────────────────────────── */
function CaseView({ caseId, me, onBack, onChanged }) {
  const [c, setC] = useState(null);
  const [thread, setThread] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [shot, setShot] = useState(null);   // the photo of the fix, if one was taken
  const resolutionRef = useRef(null);
  const commentRef = useRef(null);

  /* select('*') rather than a column list. Nelos has grown columns over
     several migrations, and asking for one this database has not got would
     fail the whole read. One row, so the width costs nothing. */
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('nelos_cases').select('*').eq('id', caseId).single();
    if (error) { setErr(error.message || 'Could not open this case.'); return; }
    setC(data);
    const { data: rows } = await supabase
      .from('nelos_case_comments').select('*').eq('case_id', caseId)
      .order('created_at', { ascending: true });
    setThread(rows || []);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  /* A system note, best effort. A status change that saved but whose note
     did not is untidy; one refused because the note failed would be worse. */
  async function note(body, kind = 'status') {
    try {
      await supabase.from('nelos_case_comments').insert([
        { case_id: caseId, body, kind, author_name: me.name, author_id: me.id },
      ]);
    } catch (e) { /* the case still moved */ }
  }

  async function patch(fields, noteText) {
    setBusy(true); setFlash(null);
    try {
      const { data, error } = await supabase.from('nelos_cases')
        .update({ updated_by: me.name, updated_at: new Date().toISOString(), ...fields })
        .eq('id', caseId).select().single();
      if (error) { setFlash({ ok: false, msg: `Could not save — ${error.message}` }); return false; }
      setC(data);
      onChanged();
      if (noteText) await note(noteText);
      await load();
      return true;
    } catch (e) {
      setFlash({ ok: false, msg: `Could not save — ${e?.message || 'network'}` });
      return false;
    } finally { setBusy(false); }
  }

  async function start() {
    // Picking up a case nobody owns makes you the owner — otherwise "In
    // Progress, unassigned" becomes where cases go to be forgotten.
    const claim = c.assignee_id ? {} : { assignee_id: me.id, assignee_name: me.name };
    await patch({ status: 'in_progress', ...claim },
      `Started work${c.assignee_id ? '' : ' and took ownership'} — ${me.name}`);
  }

  /* The photo of the fix, into the same bucket and path shape the dock
     uses (mjm-ai-system/shared/shared_nelos_dock.js → uploadShot) so one
     case's picture is in the same place whichever surface solved it. */
  async function uploadShot(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `solve/${caseId}-${Date.now()}.${ext || 'jpg'}`;
    const { error } = await supabase.storage.from('nelos-photos')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (error) return null;
    return supabase.storage.from('nelos-photos').getPublicUrl(path).data?.publicUrl || null;
  }

  async function confirmResolve() {
    const text = resolutionRef.current?.value.trim();
    if (!text) {
      setFlash({ ok: false, msg: 'Say what was done before resolving.' });
      resolutionRef.current?.focus();
      return;
    }
    /* Upload BEFORE the patch: a failed upload leaves the case as it was,
       whereas patching first would mark work solved and then lose the
       picture of it. The column is written only when there is a photo, so
       a database without migration_nelos_solve_photo.sql still resolves. */
    const url = shot ? await uploadShot(shot) : null;
    const fields = { status: 'resolved', resolution: text, resolved_by: me.name,
                     resolved_at: new Date().toISOString() };
    if (url) fields.resolution_photo_url = url;

    const ok = await patch(fields, `Resolved — ${me.name}`);
    if (ok) { setResolving(false); setShot(null); setFlash({ ok: true, msg: 'Case resolved.' }); }
  }

  async function closeCase() {
    if (!window.confirm("Close this case? It leaves everyone's To-Do list.")) return;
    await patch({ status: 'closed', closed_by: me.name, closed_at: new Date().toISOString() },
      `Closed — ${me.name}`);
  }

  async function reopen() {
    await patch({ status: 'open', resolved_at: null, resolved_by: null, closed_at: null, closed_by: null },
      `Reopened — ${me.name}`);
  }

  async function postComment() {
    const body = commentRef.current?.value.trim();
    if (!body) return;
    setBusy(true);
    await note(body, 'comment');
    commentRef.current.value = '';
    onChanged();
    await load();
    setBusy(false);
  }

  const back = (
    <button onClick={onBack}
      className="text-[11px] font-black uppercase tracking-widest text-violet-700 hover:text-violet-900 cursor-pointer">
      ‹ Back
    </button>
  );

  if (err) return <div className="p-4">{back}<div className="mt-4 text-[12.5px] font-bold text-slate-400">{err}</div></div>;
  if (!c) return <div className="p-4">{back}<div className="mt-4 text-[12.5px] font-bold text-slate-400">loading case…</div></div>;

  const s = c.status;
  const pending = s === 'open' || s === 'in_progress';
  /* Where the work is: the nursery with its plot in brackets, and the batch
     only when there is one — a batch case that did not say so would be
     missing the thing that identifies it. */
  let where = c.nursery_name ? c.nursery_name + (c.plot_name ? ` (${c.plot_name})` : '')
                             : (c.plot_name || '');
  if (c.batch_name) where = (where ? `${where} · ` : '') + `Batch ${c.batch_name}`;

  const btn = 'px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-white cursor-pointer disabled:opacity-50';
  const sec = 'text-[10px] font-black uppercase tracking-[.11em] text-violet-700';
  const kk  = 'text-[8.5px] font-black uppercase tracking-widest text-slate-400';
  const vv  = 'text-[12px] font-bold text-slate-800 mt-0.5 leading-snug break-words';

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        {back}
        <span className="ml-auto text-[10px] font-black tracking-wider text-slate-400">{c.case_no || ''}</span>
      </div>

      {/* The dock's case pane, move for move
          (mjm-ai-system/shared/shared_nelos_dock.js → detailHtml): two
          blocks in the order the job is done. The pills that were here read
          "FC Portal · Normal · Open" on very nearly every case — three
          words of nothing between the title and the work — and the four-cell
          grid said the same things at greater length. Keep the two in step. */}
      <div className={`${sec} mt-3`}>{pending ? 'Pending Case Details' : 'Case Details'}</div>
      <h3 className="mt-1.5 text-[16px] font-black text-slate-800 leading-tight">{c.title}</h3>
      <div className="mt-1 text-[11px] font-bold text-slate-400">
        Created {fmtDate((c.created_at || '').slice(0, 10))}
        {c.raised_by ? ` · by ${c.raised_by}` : ''}
      </div>

      <div className="grid grid-cols-3 gap-x-2.5 gap-y-2 mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
        <div className="min-w-0"><div className={kk}>Nursery (Plot)</div><div className={vv}>{where || '—'}</div></div>
        <div className="min-w-0"><div className={kk}>Assigned to</div>
          <div className={vv}>{SOURCE_LABEL[c.assigned_module || c.source_module] || c.assigned_module || c.source_module || '—'}</div></div>
        <div className="min-w-0"><div className={kk}>PIC</div>
          <div className={vv}>{c.assignee_name || <span className="text-slate-400 font-semibold">Unassigned</span>}</div></div>
      </div>

      {/* What was written about it — the one field saying what is actually
          wrong, and this window never showed it. */}
      <div className={`mt-3 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
        c.description ? 'text-slate-700' : 'text-slate-400 italic'}`}>
        {c.description || 'No further detail was written.'}
      </div>

      {c.resolution && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Resolution</div>
          <div className="text-[12.5px] font-bold text-emerald-800 mt-1 whitespace-pre-wrap">{c.resolution}</div>
          {c.resolution_photo_url &&
            <img src={c.resolution_photo_url} alt="Photo of the fix" className="w-full rounded-lg mt-2 block" />}
        </div>
      )}

      {flash && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-[11.5px] font-black ${
          flash.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{flash.msg}</div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {s === 'open' && <button className={`${btn} bg-violet-600`} disabled={busy} onClick={start}>▶ Start Work</button>}
        {(s === 'open' || s === 'in_progress') && (
          <button className={`${btn} bg-emerald-600`} disabled={busy} onClick={() => setResolving((v) => !v)}>✓ Mark Resolved</button>
        )}
        {s === 'resolved' && <button className={`${btn} bg-slate-600`} disabled={busy} onClick={closeCase}>🔒 Close Case</button>}
        {(s === 'resolved' || s === 'closed') && (
          <button className={`${btn} bg-orange-600`} disabled={busy} onClick={reopen}>↩ Reopen</button>
        )}
      </div>

      {resolving && (
        <div className="mt-4 pt-3.5 border-t border-violet-100">
          <div className={sec}>Solve Case</div>

          {shot ? (
            <div className="relative mt-2 rounded-xl overflow-hidden bg-slate-100">
              <img src={URL.createObjectURL(shot)} alt="Photo of the fix"
                   className="w-full max-h-56 object-cover block" />
              <button type="button" onClick={() => setShot(null)} aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/60 text-white text-[12px] leading-none cursor-pointer">✕</button>
            </div>
          ) : (
            <label className="mt-2 flex flex-col items-center justify-center gap-1 min-h-[68px] cursor-pointer
                              border-[1.5px] border-dashed border-violet-200 rounded-xl bg-violet-50/60
                              text-violet-700 text-[11.5px] font-black">
              <span aria-hidden="true">📷</span>
              <span>Take or attach a photo</span>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                     onChange={(e) => setShot(e.target.files?.[0] || null)} />
            </label>
          )}

          {/* Labelled rather than prompted from inside the box: a placeholder
              is gone the moment anybody types, so the one thing saying what
              the box is for disappears as they start filling it in. */}
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-3 mb-1.5">Solve Case Remark</div>
          <textarea ref={resolutionRef} rows={3} autoFocus
            className="w-full border-[1.5px] border-slate-200 rounded-xl px-3 py-2 text-[13px] font-semibold outline-none focus:border-violet-400" />
          <button className={`${btn} bg-emerald-600 mt-2`} disabled={busy} onClick={confirmResolve}>Confirm Resolved</button>
        </div>
      )}

      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-4 mb-1">Thread</div>
      <div className="mb-3">
        {thread.length ? thread.map((r) => {
          const sys = r.kind !== 'comment';
          return (
            <div key={r.id || `${r.created_at}-${r.body}`} className="flex gap-2 py-2 border-b border-dashed border-slate-100 last:border-0">
              <div className={`w-6 h-6 rounded-full grid place-items-center text-[9.5px] font-black shrink-0 ${
                sys ? 'bg-slate-100 text-slate-400' : 'bg-violet-100 text-violet-700'}`}>
                {sys ? '⚙' : initials(r.author_name)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-black text-slate-700">{r.author_name || 'Unknown'}</span>
                <span className="text-[10px] font-bold text-slate-300"> · {fmtStamp(r.created_at)}</span>
                <div className={`text-[12.5px] font-semibold mt-0.5 whitespace-pre-wrap ${
                  sys ? 'text-slate-400 italic' : 'text-slate-700'}`}>{r.body}</div>
              </div>
            </div>
          );
        }) : <div className="text-[11.5px] font-bold text-slate-300 py-2">No comments yet.</div>}
      </div>

      <textarea ref={commentRef} rows={2} placeholder="Add a comment…"
        className="w-full border-[1.5px] border-slate-200 rounded-xl px-3 py-2 text-[13px] font-semibold outline-none focus:border-violet-400" />
      <button className={`${btn} bg-violet-600 mt-2`} disabled={busy} onClick={postComment}>Post Comment</button>
    </div>
  );
}

/* ── The list ────────────────────────────────────────────────────── */
function Row({ c, onOpen }) {
  const bits = [
    c.case_no,
    [c.batch_name && `Batch ${c.batch_name}`, c.plot_name, c.nursery_name].filter(Boolean).join(' · '),
    c.assignee_name ? `→ ${c.assignee_name}` : null,
  ].filter(Boolean);
  return (
    <button type="button" onClick={() => onOpen(c.id)}
      className="w-full text-left flex items-start gap-2.5 px-4 py-2.5 border-b border-dashed border-slate-100 hover:bg-violet-50 cursor-pointer">
      <span className={`w-2 h-2 rounded-full mt-[7px] shrink-0 ${DOT[c.priority] || DOT.normal}`}
        title={PRIORITY_LABEL[c.priority] || ''} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-bold leading-tight ${isOverdue(c) ? 'text-rose-800' : 'text-slate-800'}`}>
          {c.title}
        </span>
        <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">
          <span className="inline-block text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 px-1.5 py-px rounded">
            {SOURCE_LABEL[c.source_module] || c.source_module}
          </span>
          {bits.map((b) => <span key={b}> · {b}</span>)}
          {c.due_date && (isOverdue(c)
            ? <span className="text-rose-700 font-black whitespace-nowrap"> · ⏰ overdue {fmtDay(c.due_date)}</span>
            : <span className="whitespace-nowrap"> · due {fmtDay(c.due_date)}</span>)}
        </span>
      </span>
    </button>
  );
}

export default function NelosWindow({ onClose, onCount }) {
  const { session } = useAuth();
  const [state, setState] = useState({ status: 'loading', rows: [], uid: null });
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  /* What was just raised, said once on the list the person lands back on.
     A form that closes with no word is a form you press twice. */
  const [raised, setRaised] = useState(null);

  const me = {
    id: session?.user?.id || null,
    name: session?.user?.user_metadata?.full_name || session?.user?.email || 'Unknown',
  };

  const reload = useCallback(async () => {
    const { rows, uid, failed } = await pendingCases({ module: MODULE });
    setState({ status: failed ? 'failed' : 'ready', rows, uid });
    if (onCount) onCount(failed ? 0 : rows.length);
  }, [onCount]);

  useEffect(() => { reload(); }, [reload]);

  const { rows, uid } = state;
  const mine = (c) => !!uid && c.assignee_id === uid;
  const over = rows.filter(isOverdue);
  const rest = rows.filter((c) => !isOverdue(c));
  const restMine = rest.filter(mine);
  const restOther = rest.filter((c) => !mine(c));
  const groups = [over.length, restMine.length, restOther.length].filter(Boolean).length;
  const head = 'px-4 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-400';

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[55] bg-slate-900/55 backdrop-blur-[2px]" />
      <div
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '92vh', zIndex: 56 }}
        className="bg-white rounded-t-3xl shadow-[0_-24px_70px_rgba(0,0,0,.35)] flex flex-col overflow-hidden sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[560px] sm:bottom-6 sm:rounded-3xl"
        role="dialog" aria-modal="true" aria-label="Nelos"
      >
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
          <span className="font-black text-slate-800 text-sm">NELOS</span>
          <span className="font-black text-violet-600 text-[10px] uppercase tracking-[0.18em]">To Do</span>
          {state.status === 'ready' && !!rows.length && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{rows.length}</span>
          )}
          {/* The other half of a case log: noticing one. The Field
              Conductor is the person standing in the plot. */}
          {!openId && !adding && (
            <button onClick={() => { setRaised(null); setAdding(true); }}
              className="ml-auto px-2.5 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0">
              + New Case
            </button>
          )}
          <button onClick={onClose} title="Close" aria-label="Close"
            className={`grid place-items-center w-9 h-9 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 text-xl leading-none cursor-pointer shrink-0${
              openId || adding ? ' ml-auto' : ' ml-1'}`}>
            ×
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* A case raised for another system does not land in this
              portal's queue, so the list can stay exactly as it was. Say
              so, or the Field Conductor raises it again. */}
          {!adding && !openId && raised && (
            <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-[11.5px] font-black bg-emerald-100 text-emerald-800">
              Case raised · {raised}
            </div>
          )}
          {adding ? (
            <NelosNewCase
              source={MODULE}
              me={me}
              onBack={() => setAdding(false)}
              onDone={(c) => {
                setAdding(false);
                setRaised(c?.case_no || 'the case');
                reload();
              }} />
          ) : openId ? (
            <CaseView caseId={openId} me={me}
              onBack={() => { setOpenId(null); reload(); }}
              onChanged={reload} />
          ) : state.status === 'loading' ? (
            <div className="py-10 text-center text-[12px] font-bold text-slate-300">loading cases…</div>
          ) : state.status === 'failed' ? (
            <div className="py-10 px-6 text-center text-[12px] font-bold text-slate-400">
              The case log could not be reached.<br />
              <span className="text-[11px] font-semibold text-slate-300">Everything else in the portal still works.</span>
            </div>
          ) : !rows.length ? (
            <div className="py-10 text-center text-[12px] font-bold text-slate-300">Nothing pending ✓</div>
          ) : (
            <>
              {/* Overdue leads and says so: "3 pending" and "3 overdue" are
                  not the same news, so its heading shows even alone. */}
              {!!over.length && (
                <>
                  <div className={`${head} text-rose-700 sticky top-0 bg-white`}>⏰ Overdue · {over.length}</div>
                  {over.map((c) => <Row key={c.id} c={c} onOpen={setOpenId} />)}
                </>
              )}
              {!!restMine.length && (
                <>
                  {groups > 1 && <div className={head}>Assigned to me · {restMine.length}</div>}
                  {restMine.map((c) => <Row key={c.id} c={c} onOpen={setOpenId} />)}
                </>
              )}
              {!!restOther.length && (
                <>
                  {groups > 1 && <div className={head}>Other pending cases · {restOther.length}</div>}
                  {restOther.map((c) => <Row key={c.id} c={c} onOpen={setOpenId} />)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
