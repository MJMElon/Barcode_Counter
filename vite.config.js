import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base ('./'') so the app works whether served from the custom domain
// root (scan.mjmnursery.com) OR a project sub-path. Routing uses HashRouter.
//
// Content-hashed filenames mean every deploy gets unique asset URLs, so CDN
// caches are never stale regardless of how aggressively they cache JS/CSS.
// index.html itself is always fetched fresh (GitHub Pages sets short TTL on
// HTML, and the in-app ?cb= mechanism handles any edge-case stale shells).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
