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
    return this.page.getByRole('button', { name: `Open ${title}`, exact: true }).first()
  }

  async search(query: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Open search' }).click()
    await this.searchBox.fill(query)
  }
}
