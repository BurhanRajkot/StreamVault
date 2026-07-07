import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class FavoritesPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async goto() {
    await super.goto('/favorites')
    await this.waitForAppMount()
  }

  // ─── Auth Wall ────────────────────────────────────────────────────────────

  get signInButton(): Locator {
    return this.page.locator('button:has-text("Sign In"), button:has-text("Log In"), a:has-text("Sign In")').first()
  }

  async isShowingAuthWall(): Promise<boolean> {
    return this.signInButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  get emptyStateHeading(): Locator {
    return this.page.locator('h3:has-text("Nothing saved yet"), h2:has-text("Nothing saved"), [data-testid="empty-favorites"]').first()
  }

  get emptyStateCTA(): Locator {
    return this.page.locator(
      'a:has-text("Browse"), button:has-text("Browse"), button:has-text("Discover"), a:has-text("Explore")'
    ).first()
  }

  async isShowingEmptyState(): Promise<boolean> {
    return this.emptyStateHeading.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  }

  // ─── Content ──────────────────────────────────────────────────────────────

  get mediaCards(): Locator {
    return this.page.locator('[data-testid="media-card"]')
  }

  get firstMediaCard(): Locator {
    return this.mediaCards.first()
  }

  async waitForCards(timeout = 15_000) {
    await expect(this.firstMediaCard).toBeVisible({ timeout })
  }

  async countCards(): Promise<number> {
    return this.mediaCards.count()
  }

  // ─── Page Heading ────────────────────────────────────────────────────────

  get pageHeading(): Locator {
    return this.page.locator('h1').first()
  }
}
