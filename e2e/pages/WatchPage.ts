import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class WatchPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async goto(mediaTypeOrPath?: 'movie' | 'tv' | string, idAndSlug?: string) {
    if (mediaTypeOrPath && idAndSlug) {
      await this.page.goto(`/watch/${mediaTypeOrPath}/${idAndSlug}`, { waitUntil: 'domcontentloaded' })
    } else {
      await super.goto(mediaTypeOrPath)
    }
  }

  // ─── URL Checks ───────────────────────────────────────────────────────────

  async expectUrl(pattern: RegExp = /\/watch\//) {
    await expect(this.page).toHaveURL(pattern)
  }

  // ─── Back Navigation ──────────────────────────────────────────────────────

  get backButton(): Locator {
    return this.page.locator('button:has-text("Back"), button[aria-label*="back"], button[aria-label*="Back"]').first()
  }

  async goBack() {
    await expect(this.backButton).toBeVisible({ timeout: 5_000 })
    await this.backButton.click()
  }

  // ─── Favorites ────────────────────────────────────────────────────────────

  get addToFavoritesButton(): Locator {
    return this.page.locator('.fixed button[aria-label="Add to favorites"]').first()
  }

  get removeFromFavoritesButton(): Locator {
    return this.page.locator('.fixed button[aria-label="Remove from favorites"]').first()
  }

  async addToFavorites() {
    await expect(this.addToFavoritesButton).toBeVisible({ timeout: 10_000 })
    await this.addToFavoritesButton.click()
    await expect(this.removeFromFavoritesButton).toBeVisible({ timeout: 5_000 })
  }

  async removeFromFavorites() {
    await expect(this.removeFromFavoritesButton).toBeVisible({ timeout: 10_000 })
    await this.removeFromFavoritesButton.click({ force: true })
  }

  // ─── Content ──────────────────────────────────────────────────────────────

  get movieTitle(): Locator {
    return this.page.locator('h1, h2').first()
  }

  get overviewText(): Locator {
    return this.page.locator('p').filter({ hasText: /\w{20,}/ }).first()
  }

  get genreTags(): Locator {
    return this.page.locator('[class*="genre"], span:has-text("Action"), span:has-text("Drama")').first()
  }

  get trailerButton(): Locator {
    return this.page.locator('button:has-text("Trailer"), button:has-text("Watch Trailer"), a:has-text("Trailer")').first()
  }

  get castSection(): Locator {
    return this.page.locator('[class*="cast"], section:has-text("Cast")').first()
  }

  // ─── Dislike / Rating ─────────────────────────────────────────────────────

  get dislikeButton(): Locator {
    return this.page.locator('button[aria-label*="dislike"], button[aria-label*="Dislike"]').first()
  }

  get ratingBadge(): Locator {
    return this.page.locator('[class*="rating"], [aria-label*="rating"]').first()
  }
}
