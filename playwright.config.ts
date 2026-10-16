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
    ...(ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
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
