import { defineConfig, devices } from '@playwright/test'

/**
 * StreamVault Playwright Configuration
 *
 * Single-browser (Chrome) strategy with deep, thorough coverage across:
 *  - Authenticated and unauthenticated states
 *  - All app routes and feature flows
 *  - Multiple viewport sizes (tested within spec files via test.use)
 *  - Mobile Chrome emulation for responsive tests
 *
 * Set BASE_URL to point at staging/production for remote audits.
 *
 * IMPORTANT: video & screenshot are set to 'on' (not 'only-on-failure')
 * so that every test run produces visual evidence. This ensures we can
 * catch "tests pass but the site looks broken" issues in the report.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',

  /** Run tests in each file in parallel */
  fullyParallel: true,

  /** Fail the build on CI if any test.only() is left in source */
  forbidOnly: !!process.env.CI,

  /** Retry once on CI, 0 locally for fast feedback */
  retries: process.env.CI ? 1 : 0,

  /** Limit parallelism on CI to avoid resource contention */
  workers: process.env.CI ? 2 : undefined,

  /** Attribute for page.getByTestId() */
  use: {
    testIdAttribute: 'data-testid',
  },

  /** Global expect timeouts — give content-heavy assertions extra time */
  expect: {
    timeout: 10_000,
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
    ['json', { outputFile: 'e2e/test-results/results.json' }],
  ],

  projects: [
    // ─── Primary: Desktop Chrome ─────────────────────────────────────────
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL || 'http://localhost:4173',
        /**
         * Always capture screenshots & video so the Playwright report
         * shows visual evidence for EVERY test — not just failures.
         * This is critical for catching "passes but site is blank" issues.
         */
        screenshot: 'on',
        video: 'on',
        trace: 'retain-on-failure',
        /* Generous timeouts — preview build can be slow to hydrate */
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        /* Consistent locale / timezone for date-sensitive tests */
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        /* Accept all permissions upfront */
        permissions: [],
      },
    },

    // ─── Mobile Chrome (Pixel 7) ──────────────────────────────────────────
    // Runs the full suite against a mobile Chrome UA + viewport.
    // Catches layout bugs that only appear in narrow/touch contexts.
    {
      name: 'Mobile Chrome (Pixel 7)',
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env.BASE_URL || 'http://localhost:4173',
        screenshot: 'on',
        video: 'on',
        trace: 'retain-on-failure',
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
      },
      /* Exclude heavy performance tests that are viewport-agnostic */
      testIgnore: ['**/performance.spec.ts'],
    },
    // ─── Brave Browser ────────────────────────────────────────────────────────
    // Runs against the local Brave browser installation for the primary requested environment
    {
      name: 'Brave',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: {
          executablePath: '/usr/bin/brave',
        },
        baseURL: process.env.BASE_URL || 'http://localhost:4173',
        screenshot: 'on',
        video: 'on',
        trace: 'retain-on-failure',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
      },
    },
  ],

  /* ─── Web Server ──────────────────────────────────────────────────────────
   * Spins up `vite preview` (production build) before running tests.
   * Skipped on CI where the server is started externally.
   * VITE_MOCK_AUTH=true enables the mock auth0 provider in the preview build.
   */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          VITE_MOCK_AUTH: 'true',
          VITE_API_URL: 'http://localhost:4000',
        },
      },
})
