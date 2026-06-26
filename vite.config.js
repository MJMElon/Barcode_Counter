import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base ('./') so the app works whether served from the custom domain
// root (scan.mjmnursery.com) OR the project sub-path
// (mjmelon.github.io/Barcode_Counter/). Safe because routing uses HashRouter.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // SELF-DESTROYING: the previous precaching service worker kept serving a
      // stale app shell and left returning devices on a blank page. This emits a
      // sw.js that unregisters any existing service worker and clears its caches,
      // so stuck devices recover automatically and the app always loads fresh
      // from the network. (Offline app-shell caching is disabled for now; the
      // app still works offline once loaded via localStorage/session.)
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MJM Scan & DO',
        short_name: 'MJM Scan',
        description: 'MJM Nursery — Barcode Scan Counter & Issue Collection DO',
        theme_color: '#0a0f14',
        background_color: '#0a0f14',
        display: 'standalone',
        start_url: '.',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // App shell only. Supabase / Gemini calls always hit the network.
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Stable (non-hashed) filenames. GitHub Pages caches index.html for ~10 min;
    // with hashed asset names, a stale cached index.html can point at a filename
    // a newer deploy already deleted → the app script 404s and the page goes
    // blank. Fixed names always exist across deploys, so this can't happen.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
