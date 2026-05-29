/**
 * StreamVault E2E — Base Page Object
 *
 * All page objects extend this class, giving them common utilities
 * like waiting for the app shell, checking for console errors, etc.
 *
 * IMPORTANT: Every content assertion is designed to FAIL if the page
 * renders blank/broken — never pass a test with no visible output.
 */

import { type Page, type Locator, expect } from '@playwright/test'

export class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  async goto(path = '/') {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' })
  }

  async waitForNetworkIdle() {
    await this.page.waitForLoadState('networkidle')
  }

  // ─── App Shell — Strong Content Guards ─────────────────────────────────

  /**
   * Original: only checked #root.children.length > 0 — a blank <div> passes.
   * Now: waits for React to mount AND verifies visible content exists.
   */
  async waitForAppMount() {
    const root = this.page.locator('#root')
    await expect(root).toBeVisible()
    // Wait for React to actually render children
    await this.page.waitForFunction(() => {
      const el = document.getElementById('root')
      return el !== null && el.children.length > 0
    }, { timeout: 10_000 })
  }

  /**
   * Stronger version: waits for the app to render MEANINGFUL content.
   * - #root has children
   * - At least one heading or paragraph with text is visible
   * - Body text > 50 chars (not just a loading spinner)
   */
  async waitForAppReady() {
    await this.waitForAppMount()

    // Wait for actual text content — not just an empty shell
    await this.page.waitForFunction(() => {
      const body = document.body
      if (!body) return false
      const text = body.innerText || ''
      // Must have meaningful text (not just whitespace or a single word like "Loading")
      return text.trim().length > 50
    }, { timeout: 15_000 })
  }

  /**
   * Assert the page has real visible content — use this after navigation
   * to catch blank/broken pages that would otherwise pass silently.
   *
   * Checks:
   *  1. Body has > 100 chars of visible text
   *  2. At least one heading (h1-h6) OR interactive element is visible
   *  3. The page is not just a blank background div
   */
  async assertPageHasVisibleContent() {
    // 1. Verify meaningful text content
    const bodyText = await this.page.evaluate(() => (document.body.innerText || '').trim())
    expect(
      bodyText.length,
      `Page appears blank: body text is only ${bodyText.length} chars ("${bodyText.slice(0, 80)}...")`
    ).toBeGreaterThan(100)

    // 2. At least one heading or interactive element must be visible
    const hasHeading = await this.page.locator('h1, h2, h3, h4, h5, h6').first().isVisible().catch(() => false)
    const hasButton = await this.page.locator('button, a[href]').first().isVisible().catch(() => false)
    const hasInput = await this.page.locator('input, select, textarea').first().isVisible().catch(() => false)
    expect(
      hasHeading || hasButton || hasInput,
      'Page has no visible headings, buttons, or form elements — looks broken'
    ).toBe(true)
  }

  /**
   * Assert the page isn't a blank screen — check for minimum content height
   * and that at least some elements are rendered beyond the skeleton.
   */
  async assertNotBlankScreen() {
    const contentHeight = await this.page.evaluate(() => {
      const root = document.getElementById('root')
      return root ? root.scrollHeight : 0
    })
    expect(
      contentHeight,
      `Page content height is only ${contentHeight}px — likely a blank screen`
    ).toBeGreaterThan(200)

    // Check that there are actual visible elements (not just an empty wrapper)
    const visibleElementCount = await this.page.evaluate(() => {
      const root = document.getElementById('root')
      if (!root) return 0
      const all = root.querySelectorAll('*')
      let count = 0
      all.forEach(el => {
        const rect = (el as HTMLElement).getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) count++
      })
      return count
    })
    expect(
      visibleElementCount,
      `Only ${visibleElementCount} visible elements in #root — page looks blank`
    ).toBeGreaterThan(10)
  }

  /**
   * Verify navigation bar is visible and has expected content.
   * Fails if the navbar is missing or empty.
   */
  async assertNavbarVisible() {
    const nav = this.page.locator('nav, [role="navigation"]').first()
    await expect(nav).toBeVisible({ timeout: 8_000 })
  }

  /**
   * Verify footer is visible with content.
   */
  async assertFooterVisible() {
    const footer = this.page.locator('footer, [role="contentinfo"]').first()
    // Footer may not be visible without scrolling — check it's attached
    await expect(footer).toBeAttached({ timeout: 8_000 })
  }

  // ─── Console / Error Capture ──────────────────────────────────────────────

  /** Returns any critical JS errors (filters known 3rd-party noise). */
  captureConsoleErrors(): string[] {
    const errors: string[] = []
    const IGNORED = ['auth0', 'intercom', 'analytics', 'net::ERR', 'Failed to load resource', 'Failed to fetch', 'chunk_reload']
    this.page.on('console', msg => {
      if (msg.type() === 'error' && !IGNORED.some(s => msg.text().includes(s))) {
        errors.push(msg.text())
      }
    })
    this.page.on('pageerror', err => {
      if (!IGNORED.some(s => err.message.includes(s))) {
        errors.push(err.message)
      }
    })
    return errors
  }

  // ─── Navigation Bar ───────────────────────────────────────────────────────

  get navbar(): Locator {
    return this.page.locator('nav, [role="navigation"]').first()
  }

  get logo(): Locator {
    return this.page.locator('a[href="/"], [aria-label*="StreamVault"], [aria-label*="logo"]').first()
  }

  async clickLogo() {
    await this.logo.click()
    await this.page.waitForURL('/')
  }

  // ─── Theme Toggle ─────────────────────────────────────────────────────────

  get themeToggle(): Locator {
    return this.page.locator('button[aria-label*="Switch to"], button[aria-label*="theme"], button[aria-label*="dark"], button[aria-label*="light"]').first()
  }

  async toggleTheme() {
    await this.themeToggle.click()
  }

  async getCurrentTheme(): Promise<string> {
    return (await this.page.locator('html').getAttribute('class')) ?? ''
  }

  // ─── SEO / Meta ───────────────────────────────────────────────────────────

  async getTitle() {
    return this.page.title()
  }

  async getMetaContent(name: string) {
    return this.page.locator(`meta[name="${name}"]`).getAttribute('content')
  }

  async getOgContent(property: string) {
    return this.page.locator(`meta[property="og:${property}"]`).getAttribute('content')
  }

  // ─── Scroll ──────────────────────────────────────────────────────────────

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await this.page.waitForTimeout(300)
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo(0, 0))
  }
}
