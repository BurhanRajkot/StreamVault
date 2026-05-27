/**
 * StreamVault E2E — Base Page Object
 *
 * All page objects extend this class, giving them common utilities
 * like waiting for the app shell, checking for console errors, etc.
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

  // ─── App Shell ───────────────────────────────────────────────────────────

  /** Waits for the React root to have at least one child — confirms React mounted. */
  async waitForAppMount() {
    const root = this.page.locator('#root')
    await expect(root).toBeVisible()
    await this.page.waitForFunction(() => {
      const el = document.getElementById('root')
      return el !== null && el.children.length > 0
    }, { timeout: 10_000 })
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
