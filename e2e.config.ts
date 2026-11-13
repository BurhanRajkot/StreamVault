import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'

/**
 * StreamVault end-to-end tests on e2e (https://e2e.com/docs) — the framework
 * new journeys are written in. See e2e/README.md.
 *
 * Like the Playwright suite (playwright.config.ts, e2e/specs/), it runs the
 * production build against the in-browser mock backend
 * (e2e/fixtures/mock-api.ts), so a run needs no backend, database, TMDB key,
 * network or model: these tests are deterministic and make no agent calls.
 *
 *   npm run test:e2e              desktop + mobile
 *   npx e2e run smoke --target desktop
 */

const PORT = 4174
const APP_URL = `http://127.0.0.1:${PORT}`

/**
 * Build into its own outDir and serve it. Both targets declare this exact
 * command, so they share one server.
 */
const app = {
  url: APP_URL,
  command: {
    executable: 'sh',
    args: [
      '-c',
      `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    ],
    env: {
      VITE_MOCK_AUTH: 'true',
      // AuthProvider refuses to render without these; placeholders only —
      // Auth0 is never contacted (see VITE_MOCK_AUTH).
      VITE_AUTH0_DOMAIN: 'auth.e2e.test',
      VITE_AUTH0_CLIENT_ID: 'e2e-client-id',
      VITE_AUTH0_AUDIENCE: 'https://api.e2e.test',
      VITE_API_URL: 'http://api.e2e.test',
    },
    startupTimeout: 240_000,
    log: '.e2e/logs/app.log',
    reuseExisting: true,
  },
}

/**
 * The production build registers a Workbox service worker whose runtime
 * caching would fetch around `browser.route` — hide the API so it never
 * registers and every request goes through the mocks.
 */
const blockServiceWorker = () => {
  Reflect.deleteProperty(Navigator.prototype, 'serviceWorker')
}

const shared = { locale: 'en-US', timezoneId: 'UTC', initScripts: [blockServiceWorker] }

export default {
  tests: ['e2e/tests/**/*.e2e.ts'],
  output: '.e2e',
  assertionTimeout: 7_500,
  timeout: 60_000,
  reporters: process.env.CI ? ['list', 'junit', 'markdown'] : ['list'],
  targets: [
    { name: 'desktop', engine: web({ ...shared, viewport: { width: 1280, height: 720 } }), app },
    { name: 'mobile', engine: web({ ...shared, viewport: { width: 412, height: 915 } }), app },
  ],
} satisfies E2EConfig
