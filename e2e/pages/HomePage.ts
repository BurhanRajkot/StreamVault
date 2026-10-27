import { expect, type Locator, type Page } from '@playwright/test'

/** The home page and the chrome every page shares (header, search). */
export class HomePage {
  readonly header: Locator
  readonly featured: Locator
  readonly searchBox: Locator
  readonly promoAnnouncement: Locator

  constructor(readonly page: Page) {
    this.header = page.getByRole('banner')
    this.featured = page.getByRole('region', { name: 'Featured content carousel' })
    this.searchBox = page.getByLabel('Search movies and TV shows')
    this.promoAnnouncement = page.getByTestId('free-premium-announcement')
  }

  async goto(): Promise<void> {
    await this.page.goto('/')
    await expect(this.featured).toBeVisible()
  }

  /** A poster card. Titles can appear in several rows; this is the first. */
  card(title: string): Locator {
    return this.page.getByRole('button', { name: cardName(title) }).first()
  }

  /** Switch browse category: the header's links on desktop, its pill row on phones. */
  async openCategory(name: string): Promise<void> {
    await this.header
      .getByRole('link', { name, exact: true })
      .or(this.header.getByRole('tab', { name, exact: true }))
      .filter({ visible: true })
      .click()
  }

  async search(query: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Open search' }).click()
    await this.searchBox.fill(query)
  }
}

/** A poster card's accessible name: "Open Inception", or "Open Inception, rated 8.4" when it shows a score. */
export function cardName(title: string): RegExp {
  return new RegExp(`^Open ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(, rated [\\d.]+)?$`)
}
