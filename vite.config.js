import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No service worker / PWA precaching. The previous precaching worker repeatedly
// served a stale app shell and caused blank pages / reload loops. We ship a
// plain static site with STABLE asset filenames, plus a self-destruct sw.js
// (in public/) that removes any leftover worker from earlier versions.
//
// Relative base ('./') so the app works whether served from the custom domain
// root (scan.mjmnursery.com) OR a project sub-path. Routing uses HashRouter.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Fixed (non-hashed) filenames so a slightly stale cached index.html always
    // finds its script instead of 404-ing and going blank.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
