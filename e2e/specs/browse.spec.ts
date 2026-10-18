/**
 * Finding something to watch: the home page, search, and getting from a
 * poster to its title page.
 */

import { test, expect } from '../fixtures/test'
import { MOVIE, SECOND_MOVIE, SHOW, titleOf, watchPath } from '../fixtures/data'
import { cardName } from '../pages/HomePage'

test.describe('Home', () => {
  test('shows the featured carousel and the catalogue', async ({ home }) => {
    await home.goto()

    await expect(home.featured.getByRole('heading', { name: titleOf(SHOW) })).toBeVisible()
    for (const media of [MOVIE, SECOND_MOVIE, SHOW]) {
      await expect(home.card(titleOf(media))).toBeVisible()
    }
  })

  test('opens a title from its poster', async ({ page, home, watch }) => {
    await home.goto()
    await home.card(titleOf(MOVIE)).click()

    await expect(page).toHaveURL(watchPath(MOVIE))
    await expect(watch.heading(MOVIE)).toBeVisible()
    await expect(watch.playButton).toBeVisible()
  })

  test('filters the catalogue to movies or TV shows', async ({ page, home }) => {
    test.skip(test.info().project.name === 'mobile', 'The section tabs are desktop navigation')
    await home.goto()

    await home.header.getByRole('button', { name: 'TV Shows' }).click()
    await expect(home.card(titleOf(SHOW))).toBeVisible()
    await expect(page.getByRole('button', { name: cardName(titleOf(MOVIE)) })).toHaveCount(0)
  })
})

test.describe('Search', () => {
  test('finds a title and opens it', async ({ page, home, watch }) => {
    await home.goto()
    await home.search('incep')

    const result = home.card(titleOf(MOVIE))
    await expect(result).toBeVisible()
    await expect(page.getByRole('button', { name: cardName(titleOf(SECOND_MOVIE)) })).toHaveCount(0)

    await result.click()
    await expect(watch.heading(MOVIE)).toBeVisible()
  })

  test('says so when nothing matches', async ({ page, home }) => {
    await home.goto()
    await home.search('zzzz no such film')

    await expect(page.getByText('No results found')).toBeVisible()
  })

  test('works from a page without a catalogue, taking the viewer to the results', async ({ page, home }) => {
    await page.goto('/favorites')
    await home.search('incep')

    await expect(page).toHaveURL('/')
    await expect(home.searchBox).toHaveValue('incep')
    await expect(home.card(titleOf(MOVIE))).toBeVisible()
  })
})

test.describe('Title page', () => {
  test('shows the details of a deep-linked title', async ({ page, watch }) => {
    await watch.goto(MOVIE)

    await expect(page.getByText(MOVIE.overview)).toBeVisible()
    await expect(page.getByText('Action').first()).toBeVisible()
  })

  test('lets a show be browsed by season', async ({ page, watch }) => {
    await watch.goto(SHOW)

    await page.getByRole('combobox', { name: 'Season' }).click()
    await page.getByRole('option', { name: 'Season 2' }).click()
    await page.getByRole('combobox', { name: 'Episode' }).click()

    // Season 2 has 13 episodes in the fixture, season 1 only 7.
    await expect(page.getByRole('option', { name: 'Episode 13', exact: true })).toBeVisible()
  })
})
