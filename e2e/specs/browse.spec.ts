/**
 * Finding something to watch: the home page, search, and getting from a
 * poster to its title page.
 */

import { test, expect, isPhone } from '../fixtures/test'
import { CATALOGUE, MOVIE, SECOND_MOVIE, SHOW, mediaById, page as listPage, titleOf, watchPath } from '../fixtures/data'
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
    // Rows below the fold load as they come into view, which shifts the page
    // while it scrolls; on WebKit the click landed beside the card. Let the
    // card settle in the viewport first.
    const card = home.card(titleOf(MOVIE))
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeInViewport({ ratio: 0.9 })
    await card.click()

    await expect(page).toHaveURL(watchPath(MOVIE))
    await expect(watch.heading(MOVIE)).toBeVisible()
    await expect(watch.playButton).toBeVisible()
  })

  test('filters the catalogue to movies or TV shows', async ({ page, home }) => {
    await home.goto()

    await home.openCategory('TV Shows')
    await expect(page).toHaveURL('/tv')
    await expect(home.card(titleOf(SHOW))).toBeVisible()
    await expect(page.getByRole('button', { name: cardName(titleOf(MOVIE)) })).toHaveCount(0)
  })

  test('gives every section its own address, kept on reload and left with Back', async ({ page, home }) => {
    await home.goto()

    await home.openCategory('Movies')
    await expect(page).toHaveURL('/movies')
    await expect(home.card(titleOf(MOVIE))).toBeVisible()
    await expect(page.getByRole('button', { name: cardName(titleOf(SHOW)) })).toHaveCount(0)

    await page.reload()
    await expect(home.card(titleOf(MOVIE))).toBeVisible()
    await expect(page.getByRole('button', { name: cardName(titleOf(SHOW)) })).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(home.card(titleOf(SHOW))).toBeVisible()
  })

  test('keeps every poster in the catalogue the same size, however long its title', async ({ page, home, mockApi }) => {
    // One long, unbreakable title used to widen its whole grid column, and the
    // 2:3 poster grew with it — rows spilled off-screen and over each other.
    const longTitle = { ...SECOND_MOVIE, id: 900001, title: 'Puella Magi Madoka Magica the Movie -Walpurgisnacht: Rising- Extended Theatrical Edition' }
    const catalogue = [...CATALOGUE, longTitle]
    mockApi.on('GET', '/tmdb/trending/:mode', { json: listPage(catalogue) })
    mockApi.on('GET', '/tmdb/discover/:mode', { json: listPage(catalogue) })

    await home.goto()
    await expect(home.card(longTitle.title)).toBeVisible()

    // The catalogue grid's cards (its virtualised rows carry data-index)
    const widths = await page
      .locator('[data-index] [data-testid="media-card"]')
      .evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().width)))
    expect(new Set(widths).size, `card widths: ${widths.join(', ')}`).toBe(1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'the page never scrolls sideways').toBeLessThanOrEqual(0)
  })

  test('offers a GitHub star from the header', async ({ home }) => {
    await home.goto()
    await expect(home.header.getByRole('link', { name: 'Star StreamVault on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/BurhanRajkot/StreamVault'
    )
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

    // Season 2 has 13 episodes in the fixture, season 1 only 7.
    if (isPhone()) {
      // A phone lists the season's episodes on the title page
      await expect(page.getByRole('region', { name: 'Episodes' }).getByRole('listitem')).toHaveCount(13)
    } else {
      await page.getByRole('combobox', { name: 'Episode' }).click()
      await expect(page.getByRole('option', { name: 'Episode 13', exact: true })).toBeVisible()
    }
  })
})

test.describe('Title page when the backend fails', () => {
  test('offers a retry instead of a 404, and the retry opens the title', async ({ page, watch, mockApi }) => {
    let backendDown = true
    mockApi.on('GET', '/tmdb/:type(movie|tv)/:id(\\d+)', ({ params }) =>
      backendDown ? { status: 503, json: { error: 'Service unavailable' } } : { json: mediaById(params.type as 'movie' | 'tv', Number(params.id)) }
    )

    await page.goto(watchPath(MOVIE))
    await expect(page.getByRole('heading', { name: /^Couldn.t load this title$/ })).toBeVisible({ timeout: 15_000 })
    backendDown = false
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(watch.heading(MOVIE)).toBeVisible()
  })
})
