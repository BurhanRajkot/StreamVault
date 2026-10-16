/**
 * Every top-level route renders — the fast "is the build alive" layer, run
 * first in CI (`--grep @smoke`). Uncaught page errors fail any test (see
 * fixtures/test.ts), so loading a route is itself an assertion.
 */

import { test, expect } from '../fixtures/test'
import { MOVIE, watchPath } from '../fixtures/data'

const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: watchPath(MOVIE), heading: 'Inception' },
  { path: '/pricing', heading: 'Unlock Premium Streaming' },
  { path: '/login', heading: 'Immersive entertainment.' },
  { path: '/signup', heading: /.+/ },
  { path: '/favorites', heading: /.+/ },
  { path: '/this-page-does-not-exist', heading: '404' },
]

test('home @smoke', async ({ home }) => {
  await home.goto()
  await expect(home.header.getByRole('link', { name: 'StreamVault' })).toBeVisible()
})

for (const { path, heading } of ROUTES) {
  test(`${path} @smoke`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading }).first()).toBeVisible()
  })
}

test.describe('first visit', () => {
  test.use({ firstVisit: true })

  test('the disclaimer is shown once, and accepting it reveals the site @smoke', async ({ page, home }) => {
    await page.goto('/')
    const accept = page.getByRole('button', { name: 'I Understand & Accept' })
    await accept.click()
    await expect(accept).toBeHidden()
    await expect(home.featured).toBeVisible()

    await page.reload()
    await expect(home.featured).toBeVisible()
    await expect(accept).toBeHidden()
  })
})
