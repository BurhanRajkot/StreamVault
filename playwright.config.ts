import { defineConfig, devices } from '@playwright/test'

/**
 * StreamVault end-to-end tests — see e2e/README.md.
 *
 * Runs the production build (`vite build` + `vite preview`) against an
 * in-browser mock backend (e2e/fixtures/mock-api.ts), so a run needs no
 * backend, database, TMDB key or network — locally and on CI alike.
 *
 *   npm run e2e                 desktop + mobile Chromium
 *   npm run e2e:all-browsers    + Firefox and WebKit
 *   npm run e2e:ui              interactive
 */

const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`
const CI = !!process.env.CI
const ALL_BROWSERS = !!process.env.E2E_ALL_BROWSERS

/** Skip the Premium player's specs, and tests tagged @premium in the others. */
const WITHOUT_PREMIUM = { testIgnore: /premium-.*\.spec\.ts$/, grepInvert: /@premium/ }

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },

  reporter: CI
    ? [
        ['github'],
        ['list'],
        ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
        ['junit', { outputFile: 'e2e/test-results/junit.xml' }],
      ]
    : [['list'], ['html', { outputFolder: 'e2e/playwright-report', open: 'on-failure' }]],

  use: {
    baseURL: BASE_URL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
    // The production build registers a Workbox service worker whose runtime
    // caching would fetch around page.route() — block it so every request
    // goes through the mocks.
    serviceWorkers: 'block',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    // The weekly sweep covers what visitors use in other engines. ⚡ Premium
    // is left to Chromium (every push, above): it only plays for the admin,
    // and its tests decode real video — a VP9/Opus clip and an fMP4 stream
    // that Playwright's Linux WebKit and Firefox builds don't play the way
    // Safari and Firefox proper do, so they failed here every Monday.
    ...(ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] }, ...WITHOUT_PREMIUM },
          { name: 'webkit', use: { ...devices['Desktop Safari'] }, ...WITHOUT_PREMIUM },
          { name: 'mobile-safari', use: { ...devices['iPhone 15'] }, ...WITHOUT_PREMIUM },
        ]
      : []),
  ],

  webServer: {
    // A separate outDir so an e2e build never clobbers the real `dist/`.
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 180_000,
    env: {
      VITE_MOCK_AUTH: 'true',
      // AuthProvider refuses to render without these; CI has no .env.local.
      // Placeholders only — Auth0 is never contacted (see VITE_MOCK_AUTH).
      VITE_AUTH0_DOMAIN: 'auth.e2e.test',
      VITE_AUTH0_CLIENT_ID: 'e2e-client-id',
      VITE_AUTH0_AUDIENCE: 'https://api.e2e.test',
      VITE_API_URL: 'http://api.e2e.test',
    },
  },
})
