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
          // ── TMDB Images (posters, backdrops, thumbnails): cache-first ────
          // Images are content-addressed (path = hash) so they never change.
          // CacheFirst = served from disk instantly, no network roundtrip.
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
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
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 15 * 60, // 15 min
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
      ...(process.env.VITE_MOCK_AUTH === "true"
        ? { "@auth0/auth0-react": path.resolve(__dirname, "./src/auth/mock-auth0.tsx") }
        : {}),
    },
  },
  build: {
    // Target modern browsers only — avoids legacy polyfill bloat
    target: 'esnext',
    // Inline assets smaller than 4kb directly into the HTML (icons, tiny SVGs)
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (['react', 'react-dom', 'react-router-dom'].some(pkg => id.includes(`node_modules/${pkg}`))) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/@radix-ui/')) {
              return 'ui-vendor';
            }
            if (id.includes('node_modules/@auth0/auth0-react')) {
              return 'auth-vendor';
            }
            if (id.includes('node_modules/@tanstack/react-query')) {
              return 'query-vendor';
            }
            if (id.includes('node_modules/framer-motion')) {
              return 'motion-vendor';
            }
            if (id.includes('node_modules/@studio-freight/lenis')) {
              return 'scroll-vendor';
            }
            if (id.includes('node_modules/recharts')) {
              return 'charts-vendor';
            }
            if (['react-hook-form', '@hookform/resolvers', 'zod'].some(pkg => id.includes(`node_modules/${pkg}`))) {
              return 'form-vendor';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: false,  // keep debugger; – used by DevToolsGuard timing attack in blocker.js
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
        passes: 2,
      },
      mangle: true,
    },
    sourcemap: mode === 'development',
  },
}));

