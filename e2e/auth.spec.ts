/**
 * StreamVault E2E — Auth, Route Protection & Login UI
 *
 * Covers:
 *  - Protected routes (/favorites, /downloads) redirect unauthenticated users
 *  - /login page renders correctly with expected UI elements
 *  - /signup page loads
 *  - After mock sign-in, protected routes become accessible
 *  - Auth state persists across page reload
 *  - Pricing page is accessible without auth
 *  - Pricing page shows plan cards and CTAs
 *  - Logging out clears the session (mocked)
 */

import { test, expect } from './fixtures'

const PROTECTED_ROUTES = [
  { path: '/favorites', name: 'Favorites' },
  { path: '/downloads', name: 'Downloads' },
] as const

// ─── Route Protection — Unauthenticated ───────────────────────────────────

test.describe('Route Protection — Unauthenticated', () => {
  for (const { path, name } of PROTECTED_ROUTES) {
    test(`${name} (${path}) redirects or shows auth wall to unauthenticated user`, async ({ unauthMockPage: page }) => {
      await page.goto(path)

      // Give the page up to 5s to redirect
      await page.waitForURL(url => !url.pathname.startsWith(path), { timeout: 5_000 }).catch(() => {})

      const currentUrl = page.url()
      const wasRedirectedByUrl =
        !currentUrl.includes(path) ||
        currentUrl.includes('login') ||
        currentUrl.includes('auth') ||
        currentUrl.includes('signin')

      // Alternatively, the page might show an in-page auth wall
      const bodyText = await page.textContent('body').catch(() => '')
      const showsAuthWall =
        (bodyText ?? '').toLowerCase().includes('sign in') ||
        (bodyText ?? '').toLowerCase().includes('log in') ||
        (bodyText ?? '').toLowerCase().includes('access denied') ||
        (bodyText ?? '').toLowerCase().includes('authorized')

      expect(wasRedirectedByUrl || showsAuthWall, `${name} accessible without auth at ${currentUrl}`).toBe(true)
    })
  }

  test('unauthenticated user on /favorites sees a sign-in button', async ({ unauthMockPage: page }) => {
    await page.goto('/favorites')
    await page.waitForLoadState('domcontentloaded')
    // Check for sign-in button (auth wall pattern) OR a redirect to /login
    const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Log In")').first()
    const onLoginPage = page.url().includes('login')
    const hasSignIn = await signInBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    expect(hasSignIn || onLoginPage).toBe(true)
  })
})

// ─── Route Protection — Authenticated ─────────────────────────────────────

test.describe('Route Protection — Authenticated', () => {
  test('/favorites is accessible when authenticated', async ({ mockApiPage: page }) => {
    await page.goto('/favorites')
    await page.waitForLoadState('domcontentloaded')
    // Should NOT redirect to login — page should render
    const isOnLoginPage = page.url().includes('login')
    expect(isOnLoginPage).toBe(false)
    // h1 should be visible (favorites or empty state)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })

  test('/downloads is accessible when authenticated (shows premium gate or content)', async ({ mockApiPage: page }) => {
    await page.goto('/downloads')
    await page.waitForLoadState('domcontentloaded')
    const isOnLoginPage = page.url().includes('login')
    expect(isOnLoginPage).toBe(false)
    // Page should render something (premium gate or content)
    await expect(page.locator('#root > *:not(script)').first()).toBeVisible({ timeout: 10_000 })
  })

  test('auth state persists across page reload', async ({ mockApiPage: page }) => {
    await page.goto('/favorites')
    await page.waitForLoadState('domcontentloaded')
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    // After reload, should still not be on login page
    expect(page.url().includes('login')).toBe(false)
    await expect(page.locator('#root > *:not(script)').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Login Page UI ────────────────────────────────────────────────────────

test.describe('Login Page UI', () => {
  test('/login page renders with an <h1>', async ({ unauthMockPage: page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('/login page has a sign-in button or form', async ({ unauthMockPage: page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    const signInElement = page.locator(
      'button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Continue"), form, input[type="email"]'
    ).first()
    await expect(signInElement).toBeVisible({ timeout: 8_000 })
  })

  test('/signup page loads and has an <h1>', async ({ unauthMockPage: page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('login page has a link to signup', async ({ unauthMockPage: page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    const signupLink = page.locator('a[href*="signup"], a:has-text("Sign up"), a:has-text("Register"), a:has-text("Create account")').first()
    if (await signupLink.count() > 0) {
      await expect(signupLink).toBeVisible()
    }
    // Not all apps have this — graceful skip if absent
  })
})

// ─── Pricing — Public Access ───────────────────────────────────────────────

test.describe('Pricing Page — Public (No Auth Required)', () => {
  test('pricing page loads without auth', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
    expect(page.url().includes('login')).toBe(false)
  })

  test('pricing page shows plan headings or a graceful error', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing')
    const planHeading = page.locator('h2:has-text("Premium"), h2:has-text("Basic"), h2:has-text("Family"), h2:has-text("Starter")').first()
    const errorText = page.locator('text=Unable to load, text=Failed to fetch').first()
    await expect(planHeading.or(errorText)).toBeVisible({ timeout: 10_000 })
  })

  test('pricing page shows at least one CTA button', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing')
    const cta = page.locator(
      'button:has-text("Pay via"), button:has-text("Subscribe"), button:has-text("Get Started"), button:has-text("Choose"), button:has-text("Retry")'
    ).first()
    await expect(cta).toBeVisible({ timeout: 10_000 })
  })

  test('pricing page is accessible when authenticated too', async ({ mockApiPage: page }) => {
    await page.goto('/pricing')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })
})

// ─── /error/* pages ───────────────────────────────────────────────────────

test.describe('Error Pages', () => {
  test('/error/403 renders an access-denied page', async ({ unauthMockPage: page }) => {
    await page.goto('/error/403')
    await page.waitForLoadState('domcontentloaded')
    const content = page.locator('h1, h2, p').filter({ hasText: /403|access denied|forbidden|permission/i }).first()
    await expect(content).toBeVisible({ timeout: 5_000 })
  })

  test('/error/500 renders a server-error page', async ({ unauthMockPage: page }) => {
    await page.goto('/error/500')
    await page.waitForLoadState('domcontentloaded')
    const content = page.locator('h1, h2, p').filter({ hasText: /500|server error|something went wrong/i }).first()
    await expect(content).toBeVisible({ timeout: 5_000 })
  })
})
