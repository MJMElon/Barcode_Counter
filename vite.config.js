import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'app.html'),
    },
  },
});
