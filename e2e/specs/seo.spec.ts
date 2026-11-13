/**
 * What search engines read: crawlable links from lists into title pages,
 * and each page's canonical URL, title and structured data.
 */

import { test, expect } from '../fixtures/test'
import { MOVIE, SHOW, titleOf, watchPath } from '../fixtures/data'

const SITE = 'https://stream-vault-7u6q.vercel.app'

test('every poster links to its title page, while a click still opens it in place', async ({ page, home, watch }) => {
  await home.goto()

  const link = page.locator(`a[href="${watchPath(MOVIE)}"]`).first()
  await expect(link).toHaveText(titleOf(MOVIE))

  await link.click()
  await expect(page).toHaveURL(watchPath(MOVIE))
  await expect(watch.heading(MOVIE)).toBeVisible()
})

test('a section page has its own title, H1 and canonical URL', async ({ page }) => {
  await page.goto('/tv')
  await expect(page).toHaveTitle(/Watch TV Shows Online Free/)
  await expect(page.getByRole('heading', { level: 1, name: 'Watch TV Shows Online Free' })).toBeAttached()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/tv`)
})

test('a title page names the title and describes it for search results', async ({ page, watch }) => {
  await watch.goto(SHOW)

  await expect(page).toHaveTitle(new RegExp(`^Watch ${titleOf(SHOW)} \\(\\d{4}\\) Online Free`))
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}${watchPath(SHOW)}`)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\//)

  const schemas = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent || '{}') as { '@type'?: string }))
  const types = schemas.map((s) => s['@type'])
  expect(types).toContain('TVSeries')
  expect(types).toContain('BreadcrumbList')
})
