import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Injects the built file list into dist/sw.js after every build.
 *
 * The modules are lazy chunks with content-hashed names, so the service
 * worker cannot carry a hardcoded precache list the way the audit module's
 * can — the names are different every deploy. This walks what the build
 * actually produced and rewrites the two placeholder lines in sw.js: VER
 * becomes a per-build stamp (so every deploy opens a fresh cache and
 * re-seeds it), PRECACHE becomes the real file list. Without this a tab
 * nobody had opened while online had no code on the phone to open offline.
 *
 * './' and './index.html' both go in: the CI renames app.html to index.html
 * before publishing, and a navigation can arrive as either. */
function swPrecache() {
  return {
    name: 'sw-precache-manifest',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      let files;
      try {
        files = readdirSync(resolve(dist, 'assets')).map((f) => './assets/' + f);
      } catch (e) {
        return;
      }
      const list = ['./', './index.html', './icon.svg', ...files];
      const swPath = resolve(dist, 'sw.js');
      let sw;
      try {
        sw = readFileSync(swPath, 'utf8');
      } catch (e) {
        return;
      }
      sw = sw
        .replace("const VER = 'fc-shell-dev';", `const VER = 'fc-shell-${Date.now().toString(36)}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(list)};`);
      writeFileSync(swPath, sw);
      console.log(`[sw-precache] ${list.length} files injected into sw.js`);
    },
  };
}

// Relative base ('./') so the app works whether served from the custom domain
// root (scan.mjmnursery.com) OR a project sub-path. Routing uses HashRouter.
//
// Content-hashed filenames mean every deploy gets unique asset URLs, so CDN
// caches are never stale regardless of how aggressively they cache JS/CSS.
//
// The HTML entry is app.html, NOT index.html. GitHub Pages for this repo can
// publish two ways — our build workflow, and GitHub's own "deploy from a
// branch" build, which publishes the repository root verbatim. Whichever
// finishes last wins, so the repository root must also be a working site.
// The workflow therefore commits the built output back to the root as
// index.html + assets/, and the source entry has to live under a different
// name so the build never overwrites its own input.
//
// Dev server: open /app.html (the root index.html is built output).
export default defineConfig({
  base: './',
  plugins: [react(), swPrecache()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'app.html'),
    },
  },
});
