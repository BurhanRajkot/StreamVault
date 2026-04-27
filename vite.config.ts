import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // We manage our own /public/manifest.json
      workbox: {
        // Precache compiled JS/CSS/HTML shell — the app core
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Skip caching oversized chunks (they shouldn't need offline)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit

        runtimeCaching: [
          // ── TMDB images: cache-first, 30-day TTL ────────────────────
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── TMDB API (via our backend proxy): network-first ──────────
          {
            urlPattern: /\/tmdb\/(trending|discover)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api-responses',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 60, // 30 min
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Google Fonts: stale-while-revalidate ─────────────────────
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Target modern browsers only — avoids legacy polyfill bloat
    target: 'esnext',
    // Inline assets smaller than 4kb directly into the HTML (icons, tiny SVGs)
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
          ],
          'auth-vendor':   ['@auth0/auth0-react'],
          'query-vendor':  ['@tanstack/react-query'],
          'motion-vendor': ['framer-motion'],
          'charts-vendor': ['recharts'],
          'form-vendor':   ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
        passes: 2,
      },
      mangle: true,
    },
    sourcemap: mode === 'development',
  },
}));

