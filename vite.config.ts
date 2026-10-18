import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Preconnect to the backend API from the HTML itself: every page's first
 * render waits on it, and on a phone the DNS + TCP + TLS setup is a few
 * hundred milliseconds the browser can spend while the JS downloads.
 * `crossorigin` because the API is called with CORS fetches.
 */
function preconnectApi(apiUrl: string | undefined): Plugin {
  return {
    name: "preconnect-api",
    transformIndexHtml() {
      if (!apiUrl) return [];
      let origin: string;
      try {
        origin = new URL(apiUrl).origin;
      } catch {
        return [];
      }
      return [{ tag: "link", attrs: { rel: "preconnect", href: origin, crossorigin: "" }, injectTo: "head" }];
    },
  };
}

/**
 * Dev proxy to the local backend. `/downloads` and `/admin/dashboard` are
 * also app pages, so a page load (Accept: text/html) is served the app
 * instead of being forwarded — it used to come back as the API's raw 401.
 */
const backendProxy = {
  target: "http://localhost:4000",
  changeOrigin: true,
  bypass: (req: { headers: { accept?: string } }) => (req.headers.accept?.includes("text/html") ? "/index.html" : undefined),
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/tmdb': backendProxy,
      '/continue-watching': backendProxy,
      '/downloads': backendProxy,
      '/admin': backendProxy,
      '/recommendations': backendProxy,
      '/ping': backendProxy,
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    preconnectApi(process.env.VITE_API_URL || loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL),
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
        // Only what every route needs gets a long-cached chunk of its own.
        // Everything else — Radix primitives, framer-motion, forms, hls.js —
        // is left to Rollup, so it ships with the routes that use it. A
        // catch-all "ui-vendor" made the home page download the title page's
        // Select and the pricing page's Accordion; matching on a bare
        // "node_modules/react" prefix swept react-remove-scroll & co. into the
        // framework chunk the same way.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@auth0/')) {
            return 'auth-vendor';
          }
          if (/node_modules\/@tanstack\/(react-query|query-core)\//.test(id)) {
            return 'query-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
        passes: 2,
      },
      mangle: true,
    },
    sourcemap: mode === 'development',
  },
}));

