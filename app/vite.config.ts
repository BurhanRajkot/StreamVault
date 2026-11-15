import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

/**
 * The StreamVault app (Android via Capacitor, Linux via Electron).
 *
 * It is its own UI, but it runs on the website's code: `@/…` resolves into
 * the site's src/ (API client, auth, servers, the Premium player, admin
 * panels), and `@app/…` is this folder. Shared packages resolve from the
 * repo root's node_modules, and are deduped so the site's files and the
 * app's share one React, one Query client and one Auth0 context.
 *
 * Both shells serve this build as https://stream-vault.site, so the backend's
 * CORS list, Auth0's allowed origins and the embed servers' domain checks all
 * see the site they already trust.
 */

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
/** CI stamps the release version (1.0.<run>) in; local builds use package.json's. */
const version = process.env.APP_VERSION || pkg.version

/** Public values — they ship in the website's bundle too. Overridable for a staging build. */
const env = {
  VITE_API_URL: process.env.VITE_API_URL || 'https://streamvault-backend-bq9p.onrender.com',
  VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN || 'stream-vault.jp.auth0.com',
  VITE_AUTH0_CLIENT_ID: process.env.VITE_AUTH0_CLIENT_ID || 'l9CtScPwZcvX8f7vSs96YyospYnE3P2Y',
  VITE_AUTH0_AUDIENCE: process.env.VITE_AUTH0_AUDIENCE || 'https://streamvault/api',
}

export default defineConfig({
  root: __dirname,
  base: '/',
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    ...Object.fromEntries(Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@': path.resolve(__dirname, '../src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', '@auth0/auth0-react', 'sonner'],
  },
  server: { port: 5175 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
})
