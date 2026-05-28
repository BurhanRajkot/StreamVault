import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'
import { ADMIN_HMAC_SECRET } from '../fixtures/mocks'

export class DownloadsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async goto() {
    await super.goto('/downloads')
    await this.waitForAppMount()
  }

  // ─── Premium Wall ─────────────────────────────────────────────────────────

  get premiumWarning(): Locator {
    return this.page.locator('h2:has-text("Premium Feature"), h2:has-text("Premium"), [data-testid="premium-gate"]').first()
  }

  get adminLoginButton(): Locator {
    return this.page.locator('button:has-text("Admin Login"), button:has-text("Admin")').first()
  }

  // ─── Admin Login Modal ────────────────────────────────────────────────────

  get adminCodeInput(): Locator {
    return this.page.locator('input[placeholder*="daily code"], input[placeholder*="code"], input[type="password"]').first()
  }

  get adminLoginSubmitButton(): Locator {
    return this.page.locator('button[type="submit"]:has-text("Login"), button:has-text("Submit code"), button:has-text("Unlock")').first()
  }

  /** Calculates today's HMAC code and submits the admin login modal. */
  async loginAsAdmin() {
    await expect(this.adminLoginButton).toBeVisible({ timeout: 10_000 })
    await this.adminLoginButton.click()

    const date = new Date()
    const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(ADMIN_HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dateString))
    const code = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')

    await expect(this.adminCodeInput).toBeVisible()
    await this.adminCodeInput.fill(code)
    await this.adminLoginSubmitButton.click()
  }

  // ─── Downloads List ───────────────────────────────────────────────────────

  get downloadItems(): Locator {
    return this.page.locator('[aria-label*="The Dark Knight"], [aria-label*="Inception"], [aria-label*="Breaking Bad"], [data-testid*="download-item"]')
  }

  get searchInput(): Locator {
    return this.page.locator('input[placeholder*="Search downloads"], input[placeholder*="Filter"]').first()
  }

  get clearSearchButton(): Locator {
    return this.page.locator('button[aria-label="Clear search"]').first()
  }

  async searchDownloads(query: string) {
    await expect(this.searchInput).toBeVisible()
    await this.searchInput.fill(query)
  }

  async clearSearch() {
    await this.clearSearchButton.click()
  }

  get downloadItemByTitle() {
    return (title: string) => this.page.locator(`[aria-label*="${title}"], text=${title}`).first()
  }
}
