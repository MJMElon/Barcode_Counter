# FC Portal — scan.mjmnursery.com

A React (Vite) + Supabase web app for MJM Nursery Field Conductors, hosted free
on GitHub Pages. It started life as a single-file barcode counter and has grown
into the FC's whole toolkit, so the repository is named `FC-Portal` and the app
signs itself "FC Portal" throughout.

It is reached from the main portal at `ai.mjmnursery.com`, and shares its
Supabase project with `mobile.mjmnursery.com` — staff accounts and records are
common to both.

## Modules

Each module is a card on the dashboard and a lazy-loaded route. Every one of
them is hidden from anyone whose **FC Scan Portal User Access** has that module
switched off.

1. **Scan Barcode Counter** (`/scan`) — scan seals/barcodes with the phone
   camera and count unique scans against a target quantity, with duplicate and
   over-quota alerts. Offline-first, with JSON backup/restore.
2. **Issue Collection DO** (`/do`) — search active Approval Letters (AL),
   issue/sign/print Delivery Orders, view signed consent records. Optional AI
   document scan (Google Gemini) auto-fills DO items from a photo.
3. **Plot Status** (`/plot-status`) — nursery plot stage board.
4. **Maintenance** (`/maintenance`) — the maintenance worksheet, weekly
   schedule and timeline, with photo slots per record.
5. **PALMS** (`/palms`) — Plot Activity Log Monitoring System, ported from the
   standalone NurseryPALMS app. Four tabs: the daily status entry railway, the
   monitoring dashboard, **Culling Calculator**, and settings.

### Culling Calculator

Ported from the standalone `NurseryFCmobile` app and now the third tab of
PALMS; `/culling` redirects to `/palms` so old links keep working.

Only plots currently at a culling-related PALMS stage (Saringan Anak Bibit,
Tunggu buat culling, Culling, Pengambilan) are listed. The Field Conductor taps
**Pokok Inang** to record an amount; if the resulting rate is still above 10% a
Site Auditor second entry unlocks, and if that still leaves it above 10% video
evidence is requested. Saved amounts lock and need a confirmation to change.

    culling rate = (today balance − pokok inang FC − pokok inang auditor) / transplant

The action column follows from the rate: at or under 10% the plot can request a
drone flight; above 10% it waits for the Site Auditor, and once the auditor's
count is in too, HQ is notified with the figures and the video. Requests to the
Site Auditor and to HQ are never raised automatically — the FC presses the
button and confirms.

Trial figures are still preset random numbers (no backend yet), kept on the
device in `localStorage` so entered amounts survive a reload.

## Develop locally

```bash
npm install
npm run dev        # http://localhost:5173/app.html
npm run build      # outputs static site to dist/
npm run preview    # preview the production build
```

The HTML entry is **`app.html`, not `index.html`** — the repository root
`index.html` is built output (see below), and the source entry needs a
different name so the build never overwrites its own input.

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `dist/` to Pages. The custom domain (`scan.mjmnursery.com`) is
preserved via `public/CNAME`.

The workflow also commits the built site back to the repository root. This
repository can be published by two builders at once — the workflow, and
GitHub's own "deploy from a branch" build, which serves the root verbatim —
and whichever finishes last wins. Keeping the root in sync means either
outcome serves a working site. Setting **Settings → Pages → Source = "GitHub
Actions"** stops the other builder, after which the root sync is
belt-and-braces.

`vite.config.js` sets `base: './'` and routing uses HashRouter, so the app
works from the custom domain root or a project sub-path either way.

## Configuration

- **Supabase** URL + anon key live in `src/config.js`. These are public by
  design (protected by Row Level Security) and match the mobile app.
- **Gemini AI key** (optional, for the DO photo scan) is read from the
  `VITE_GEMINI_KEY` environment variable. Locally, copy `.env.example` to
  `.env` and fill it in. For deployment, add a repo secret named
  `VITE_GEMINI_KEY`. If unset, the AI scan button is hidden and manual DO entry
  still works.

### Hiding the Gemini key (recommended next step)

Any key in front-end code can ultimately be extracted. To truly hide it, move
the Gemini call into a **Supabase Edge Function** and have `src/lib/gemini.js`
call that function instead of Google directly. The key then lives only on
Supabase's servers. (Not done yet — requires the Supabase CLI and project
access.)

## Supabase tables used

| Table | Used for |
|-------|----------|
| `shared_profiles` | Ops-access gate (`permissions`) |
| `shared_al_orders` | Active approval letters / balances |
| `shared_do_records` | Issued delivery orders (`plot_1..5`, `breed_1..5`, `qty_1..5`) |
| `mobile_consent_records` | Signed consent records per AL |
| `shared_plots`, `shared_breeds` | Nursery/breed autocomplete |
| `shared_collection_bookings` | Dashboard "who is collecting today" board |
| `shared_plot_batch_balance`, `shared_inventory_logs` | Plot batch balances |
| `operation_nurseries` | Nursery list |
| `fcportal_scan_records` | Barcode counter records |
| `nops_plot_status_entries`, `nops_plot_status_stages` | Plot Status |
| `nops_maint_field_records`, `nops_maint_state` | Maintenance |
| storage bucket `documents` | Uploaded DO photos |

PALMS (including the Culling Calculator) has no backend yet — it stores
everything on the device under the `palms_*` `localStorage` keys.

## Project structure

```
src/
  config.js              app config (Supabase + Gemini)
  i18n.js                EN / Bahasa Melayu strings
  lib/                   supabase, gemini, pdf, access, cache, outbox helpers
  context/               AuthContext (Supabase auth + ops gate), LanguageContext
  components/            AuthScreen, Dashboard, TopNav, CollectionBoard
  modules/scan/          barcode counter
  modules/do/            Issue Collection DO
  modules/plotstatus/    plot stage board
  modules/maintenance/   maintenance worksheet, schedule, timeline
  modules/palms/         PALMS + Culling Calculator
```
