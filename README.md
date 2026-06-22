# MJM Scan & DO — scan.mjmnursery.com

A React (Vite) + Supabase web app, hosted free on GitHub Pages. It replaces the
previous single-file static site with a proper, organised framework while
keeping everything working like a normal webpage.

## Modules

1. **Issue Collection DO** — search active Approval Letters (AL), issue/sign/print
   Delivery Orders, view signed consent records. Optional AI document scan
   (Google Gemini) to auto-fill DO items from a photo. Ported from
   `mobile.mjmnursery.com`'s `do_signing.html`.
2. **Scan Barcode Counter** — scan seals/barcodes with the phone camera and count
   unique scans against a target quantity, with duplicate/over-quota alerts.
   Offline-first (data stored on the device) with JSON backup/restore.

Login and data use the **same Supabase project** as `mobile.mjmnursery.com`, so
staff accounts and records are shared.

## Why React (and not Laravel)

The goal was to keep hosting free on GitHub Pages and keep using Supabase, while
making the code harder to read in the browser. Laravel needs a paid PHP server
and can't run on GitHub Pages. React with a build step ships **minified,
unreadable** JavaScript instead of the old plain-readable code — and any truly
sensitive logic can be moved into Supabase (see below). This gives the best
"hidden logic" result possible without renting a server.

## Develop locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs static site to dist/
npm run preview    # preview the production build
```

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `dist/` to Pages. **One-time setup:** in the repo, go to
**Settings → Pages → Build and deployment → Source = "GitHub Actions"**. The
custom domain (`scan.mjmnursery.com`) is preserved via `public/CNAME`.

## Configuration

- **Supabase** URL + anon key live in `src/config.js`. These are public by design
  (protected by Row Level Security) and match the mobile app.
- **Gemini AI key** (optional, for the DO photo scan) is read from the
  `VITE_GEMINI_KEY` environment variable. Locally, copy `.env.example` to `.env`
  and fill it in. For deployment, add a repo secret named `VITE_GEMINI_KEY`. If
  unset, the AI scan button is hidden and manual DO entry still works.

### Hiding the Gemini key (recommended next step)

Any key in front-end code can ultimately be extracted. To truly hide it, move
the Gemini call into a **Supabase Edge Function** and have `src/lib/gemini.js`
call that function instead of Google directly. The key then lives only on
Supabase's servers. (Not done yet — requires the Supabase CLI and project access.)

## Supabase tables used

| Table | Used for |
|-------|----------|
| `shared_profiles` | Ops-access gate (`permissions`) |
| `shared_al_orders` | Active approval letters / balances |
| `shared_do_records` | Issued delivery orders (`plot_1..5`, `breed_1..5`, `qty_1..5`) |
| `mobile_consent_records` | Signed consent records per AL |
| `shared_plots`, `shared_breeds` | Nursery/breed autocomplete |
| storage bucket `documents` | Uploaded DO photos |

## Project structure

```
src/
  config.js              app config (Supabase + Gemini)
  lib/                   supabase, gemini, pdf helpers
  context/AuthContext    Supabase auth + ops gate
  components/            AuthScreen, Dashboard, TopNav
  modules/scan/          barcode counter
  modules/do/            Issue Collection DO
```
