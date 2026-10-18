/**
 * Things tied to an account: signing in, favorites, and what a guest sees
 * instead.
 */

import { test, expect, SIGNED_IN } from '../fixtures/test'
import { MOVIE, titleOf } from '../fixtures/data'
import { cardName } from '../pages/HomePage'

test.describe('as a guest', () => {
  test('the header offers sign in and sign up', async ({ home }) => {
    test.skip(test.info().project.name === 'mobile', 'The mobile header has no account links')
    await home.goto()

    await expect(home.header.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login')
    await expect(home.header.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/signup')
  })

  test('saving a favorite asks them to log in, and saves nothing', async ({ page, watch, mockApi }) => {
    await watch.goto(MOVIE)
    await watch.root.getByRole('button', { name: 'Add to favorites' }).first().click()

    await expect(page.getByText('Please log in to add favorites')).toBeVisible()
    expect(mockApi.calls('POST', '/favorites')).toHaveLength(0)
  })

  test('signing in from the login page returns them where they were', async ({ page }) => {
    await page.goto('/login?returnTo=%2Fpricing')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page).toHaveURL('/pricing')
    await expect(page.getByRole('heading', { name: 'Unlock Premium Streaming' })).toBeVisible()
  })
})

test.describe('signed in', () => {
  test.use({ user: SIGNED_IN })

  test('the header shows their account', async ({ home }) => {
    test.skip(test.info().project.name === 'mobile', 'The mobile header has no account menu')
    await home.goto()

    await expect(home.header.getByRole('button', { name: 'Open account menu' })).toBeVisible()
    await expect(home.header.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0)
  })

  test('a favorite saved on a title page is listed on Favorites, and can be removed', async ({ page, watch, mockApi }) => {
    await watch.goto(MOVIE)
    await watch.root.getByRole('button', { name: 'Add to favorites' }).first().click()
    await expect(page.getByText('Added to favorites')).toBeVisible()
    expect(mockApi.calls('POST', '/favorites')[0].body).toMatchObject({ tmdbId: MOVIE.id, mediaType: 'movie' })

    await page.goto('/favorites')
    await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeVisible()
    const card = page.getByRole('button', { name: cardName(titleOf(MOVIE)) })
    await expect(card).toBeVisible()

    // Un-favorite from the title page — the one place both layouts offer it.
    await card.click()
    await expect(watch.heading(MOVIE)).toBeVisible()
    await watch.root.getByRole('button', { name: 'Remove from favorites' }).first().click()
    await expect(page.getByText('Removed from favorites')).toBeVisible()

    await page.goto('/favorites')
    await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeVisible()
    await expect(card).toHaveCount(0)
    expect(mockApi.state.favorites).toHaveLength(0)
  })
})
