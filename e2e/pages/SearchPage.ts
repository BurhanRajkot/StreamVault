import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class SearchPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // ─── Trigger ─────────────────────────────────────────────────────────────

  get openButton(): Locator {
    return this.page.locator('button[aria-label="Open search"]').first()
  }

  get closeButton(): Locator {
    return this.page.locator('button[aria-label="Close search"]').first()
  }

  get searchInput(): Locator {
    return this.page.locator('input[placeholder*="Search"], input[type="search"]').first()
  }

  async open() {
    await expect(this.openButton).toBeVisible()
    await this.openButton.click()
    await expect(this.searchInput).toBeVisible({ timeout: 5_000 })
  }

  async close() {
    await this.page.keyboard.press('Escape')
    await expect(this.searchInput).not.toBeVisible({ timeout: 5_000 })
  }

  async typeQuery(query: string) {
    await this.searchInput.fill(query)
  }

  async clearInput() {
    await this.searchInput.clear()
  }

  // ─── Results ─────────────────────────────────────────────────────────────

  get resultCards(): Locator {
    return this.page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').filter({ hasNot: this.page.locator('nav') })
  }

  get firstResultCard(): Locator {
    return this.resultCards.first()
  }

  get emptyStateMessage(): Locator {
    return this.page.locator('text=No results, text=Nothing found, text=no matches').first()
  }

  async waitForResults(timeout = 10_000) {
    await expect(this.firstResultCard).toBeVisible({ timeout })
  }

  async waitForEmptyState(timeout = 5_000) {
    await expect(this.emptyStateMessage).toBeVisible({ timeout })
  }

  // ─── Keyboard Navigation ─────────────────────────────────────────────────

  async pressArrowDown() {
    await this.page.keyboard.press('ArrowDown')
  }

  async pressEnter() {
    await this.page.keyboard.press('Enter')
  }

  async pressEscape() {
    await this.page.keyboard.press('Escape')
  }
}
