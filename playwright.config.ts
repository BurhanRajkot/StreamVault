import { defineConfig, devices } from '@playwright/test'

/**
 * StreamVault E2E / Audit Test Configuration
 *
 * Runs against a locally built and previewed frontend (vite preview).
 * Set BASE_URL env var to point at a staging/production URL for remote audits.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',

  /* Run all tests in a file in parallel */
  fullyParallel: true,

  /* Fail the build on CI if any test.only() is left in source */
  forbidOnly: !!process.env.CI,

  /* Retry once on CI, never locally */
  retries: process.env.CI ? 1 : 0,

  /* Use 2 parallel workers on CI, hardware-limit locally */
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
    ['json', { outputFile: 'e2e/test-results/results.json' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    /* Take a screenshot only on failure */
    screenshot: 'only-on-failure',
    /* Record video only on retry */
    video: 'on-first-retry',
    /* Attach trace on retry */
    trace: 'on-first-retry',
    /* Timeouts */
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start vite preview before running tests; skip on CI (server started separately) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
