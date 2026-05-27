import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  async goto() {
    await super.goto('/')
    await this.waitForAppMount()
  }

  async gotoAndWaitForContent() {
    await this.page.goto('/', { waitUntil: 'networkidle' })
    await this.waitForAppMount()
  }

  // ─── Hero Section ─────────────────────────────────────────────────────────

  get heroSection(): Locator {
    return this.page.locator('[data-testid="hero"], section:has(h1), .hero, [class*="hero"]').first()
  }

  get mainHeading(): Locator {
    return this.page.locator('h1').first()
  }

  // ─── Provider Filter Bar ─────────────────────────────────────────────────

  get providerFilterButtons(): Locator {
    return this.page.locator('button[aria-label^="Filter by"]')
  }

  get showAllProvidersButton(): Locator {
    return this.page.locator('button[aria-label="Show all providers"]')
  }

  async clickProvider(index = 0) {
    const btn = this.providerFilterButtons.nth(index)
    await expect(btn).toBeVisible()
    await btn.click()
  }

  async resetProviderFilter() {
    const btn = this.showAllProvidersButton
    if (await btn.count() > 0) await btn.click()
  }

  // ─── Media Cards ─────────────────────────────────────────────────────────

  get mediaCards(): Locator {
    return this.page.locator('.group.relative.cursor-pointer, [role="button"]:has(img[src*="tmdb"])').filter({ hasNot: this.page.locator('nav') })
  }

  get firstMediaCard(): Locator {
    return this.mediaCards.first()
  }

  async clickFirstMediaCard() {
    await expect(this.firstMediaCard).toBeVisible({ timeout: 10_000 })
    await this.firstMediaCard.click()
  }

  async waitForMediaCards() {
    await expect(this.firstMediaCard).toBeVisible({ timeout: 15_000 })
  }

  // ─── Section Headings ─────────────────────────────────────────────────────

  get sectionHeadings(): Locator {
    return this.page.locator('h2, h3').filter({ hasText: /trending|popular|top|new|recently|watch/i })
  }

  // ─── Theme ────────────────────────────────────────────────────────────────

  async setTheme(theme: 'light' | 'dark') {
    await this.page.evaluate((t) => {
      window.localStorage.setItem('theme', t)
    }, theme)
    await this.page.reload()
    await this.waitForAppMount()
  }
}
