import { defineConfig, devices } from '@playwright/test'

/**
 * StreamVault Playwright Configuration
 *
 * Cross-browser + multi-device strategy with deep, thorough coverage across:
 *  - Authenticated and unauthenticated states
 *  - All app routes and feature flows
 *  - Real device emulation (phones + tablets) and engines (Chromium/Firefox/WebKit)
 *  - A dedicated `chrome-real` project (installed Chrome channel) for ad-heavy
 *    real-server runs
 *
 * Set BASE_URL to point at staging/production for remote audits.
 *
 * IMPORTANT: video & screenshot are set to 'on' (not 'only-on-failure')
 * so that every test run produces visual evidence. This ensures we can
 * catch "tests pass but the site looks broken" issues in the report.
 *
 * NOTE: Firefox/WebKit/iPhone/iPad projects need their browsers installed:
 *   npx playwright install
 * On CI, add the same to your workflow before running the suite.
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

  /**
   * Exclude real-CDN / ad-heavy @skip-ci tests from normal & CI runs.
   * Override with E2E_INCLUDE_SKIP_CI=1 to include them (local real runs).
   */
  grepInvert: process.env.E2E_INCLUDE_SKIP_CI ? undefined : /@skip-ci/,

  /** Shared settings applied to every project (projects can override) */
  use: {
    /** Attribute for page.getByTestId() */
    testIdAttribute: 'data-testid',
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    /**
     * Always capture screenshots & video so the Playwright report shows
     * visual evidence for EVERY test — not just failures. Critical for
     * catching "passes but site is blank" issues.
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
    permissions: [],
    launchOptions: {
      args: ['--proxy-server=direct://']
    }
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
    // ─── Desktop engines ──────────────────────────────────────────────────
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Desktop Firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // WebKit = Safari engine — your only real blind spot today.
      name: 'Desktop Safari',
      use: { ...devices['Desktop Safari'] },
    },
    {
      // Common laptop resolution where 1080p layouts sometimes break.
      name: 'Laptop 1366',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },

    // ─── Phones ─────────────────────────────────────────────────────────────
    {
      name: 'Mobile Chrome (Pixel 7)',
      use: {
        ...devices['Pixel 7'],
        /* Mobile preview can be slower — bump timeouts */
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
      },
      /* Exclude heavy performance tests that are viewport-agnostic */
      testIgnore: ['**/performance.spec.ts'],
    },
    {
      // Smallest common screen (375px) — tightest layout constraints.
      name: 'Mobile Safari (iPhone SE)',
      use: {
        ...devices['iPhone SE'],
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
      },
      testIgnore: ['**/performance.spec.ts'],
    },
    {
      name: 'Mobile Safari (iPhone 15)',
      use: {
        ...devices['iPhone 15'],
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
      },
      testIgnore: ['**/performance.spec.ts'],
    },

    // ─── Tablets ──────────────────────────────────────────────────────────────
    {
      name: 'Tablet (iPad Pro 11)',
      use: {
        ...devices['iPad Pro 11'],
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
      },
      testIgnore: ['**/performance.spec.ts'],
    },
    {
      name: 'Tablet (iPad Mini)',
      use: {
        ...devices['iPad Mini'],
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
      },
      testIgnore: ['**/performance.spec.ts'],
    },

    // ─── Real, ad-heavy run against live servers (installed Chrome channel) ──
    // The bundled Chromium above has no ads issue with mocks; this uses your
    // actual installed Chrome where the provider serves ads. Pair with the
    // adblock fixture (E2E_ADBLOCK=1) and include @skip-ci tests:
    //   E2E_ADBLOCK=1 E2E_INCLUDE_SKIP_CI=1 \
    //     npx playwright test playback.spec.ts --project=chrome-real
    {
      name: 'chrome-real',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },

    // ─── Brave Browser (local-only) ───────────────────────────────────────────
    // Not included in CI — Brave is not installed on GitHub runners.
    // Brave blocks ads natively, so it's a good manual cross-check of the
    // real provider iframe. To run locally:
    //   npx playwright test --project=Brave
    // Uncomment and ensure Brave is installed at the path below.
    //
    // {
    //   name: 'Brave',
    //   use: {
    //     ...devices['Desktop Chrome'],
    //     launchOptions: { executablePath: '/usr/bin/brave' },
    //   },
    // },
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