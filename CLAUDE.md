# Working on the MJM Nursery phone apps

This repository is one half of a system. **The notes that matter live in the
other half — `mjm-ai-system/CLAUDE.md`** — and they apply here too. Read them
first; the most important one is that any change needing something run in the
database is not finished until the person has been handed the SQL to run,
because this environment cannot reach Supabase and never will.

What is specific to this repository:

- **Two front doors, one build.** `/` is the 555 FC Portal, signed in with a
  Supabase account. `/#/worker` is the 555 Worker Portal, entered with the PIN
  on a worker's row of the payroll register. A worker is `anon` and cannot read
  any table directly — everything goes through the `worker_*` database
  functions, which check the token and the boundary before answering. That is
  the whole security model.
- **The entry HTML is `app.html`, not `index.html`.** CI builds and commits the
  output back to the repository root, so the root `index.html` IS build output
  and the source must live under a different name or the build overwrites its
  own input. Dev server: open `/app.html`.
- **Offline is not a mode, it is the path.** Records go into an outbox
  (`src/lib/outbox.js`) and are sent from there, so the same code runs with a
  bar of signal or none. There is no separate offline branch to be in the wrong
  one of.
- **`public/sw.js` is a runtime-caching service worker, network-first for
  HTML.** It replaced a self-destruct worker whose job was to undo an earlier
  PRECACHING one that served a stale app shell — a real production incident.
  Offline entry was then asked for on purpose (a Field Conductor loses signal
  for hours and must still open the portal), and network-first HTML is what
  makes that safe to have again: with signal the live deploy always wins, and
  the cache only answers when the network itself fails. That property is
  load-bearing — do not flip it to cache-first, that is how the incident
  happened. app.html's recovery code still removes workers and caches when
  the app fails to mount, so a misbehaving worker cleans itself up.
- Rules shared with the office repository carry a comment saying so in both
  copies. Change one, change the other.
