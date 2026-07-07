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

  /**
   * Navigate to homepage and wait for ACTUAL content to render —
   * not just the React shell, but real movie cards, headings, etc.
   */
  async gotoAndWaitForContent() {
    await this.page.goto('/', { waitUntil: 'networkidle' })
    await this.waitForAppReady()
    // Verify actual content rendered — not just an empty shell
    await this.assertNotBlankScreen()
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
    // `data-testid="media-card"` is only set on the grid-style card variant —
    // it deliberately excludes the full-bleed hero banner, which also
    // matches `[role="button"]:has(img)` but isn't a grid column.
    return this.page.locator('[data-testid="media-card"]')
  }

  get firstMediaCard(): Locator {
    return this.mediaCards.first()
  }

  async clickFirstMediaCard() {
    await expect(this.firstMediaCard).toBeVisible({ timeout: 15_000 })
    await this.firstMediaCard.click()
  }

  async waitForMediaCards() {
    await expect(this.firstMediaCard).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Verify media cards have actual poster images loaded (not broken/empty).
   */
  async assertMediaCardsHaveContent() {
    await this.waitForMediaCards()
    const cardCount = await this.mediaCards.count()
    expect(cardCount, 'No media cards found on homepage').toBeGreaterThan(0)

    // Check first card has an image with a non-empty src
    const firstCardImg = this.firstMediaCard.locator('img').first()
    if (await firstCardImg.count() > 0) {
      const src = await firstCardImg.getAttribute('src')
      expect(src, 'Media card image has no src').toBeTruthy()
      expect(src!.length, 'Media card image src is empty').toBeGreaterThan(0)
    }
  }

  // ─── Section Headings ─────────────────────────────────────────────────────

  get sectionHeadings(): Locator {
    return this.page.locator('h2, h3').filter({ hasText: /trending|popular|top|new|recently|watch|discover/i })
  }

  // ─── Theme ────────────────────────────────────────────────────────────────

  async setTheme(theme: 'light' | 'dark') {
    await this.page.evaluate((t) => {
      window.localStorage.setItem('theme', t)
    }, theme)
    await this.page.reload()
    await this.waitForAppMount()
  }

  // ─── Footer ───────────────────────────────────────────────────────────────

  get footer(): Locator {
    return this.page.locator('footer').first()
  }

  /**
   * Verify that the footer has actual text content — not just an empty element.
   */
  async assertFooterHasContent() {
    await this.scrollToBottom()
    const footer = this.footer
    await expect(footer).toBeAttached({ timeout: 5_000 })
    const footerText = await footer.innerText().catch(() => '')
    expect(footerText.trim().length, 'Footer has no text content').toBeGreaterThan(10)
  }
}
