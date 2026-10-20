/**
 * The Anime tab: a section of its own where everything is anime — films and
 * series both — and every title plays on ⚡ Premium like any other.
 */

import { test, expect } from '../fixtures/test'
import { ANIME_MOVIE, ANIME_SHOW, MOVIE, SECOND_MOVIE, SHOW, titleOf, watchPath } from '../fixtures/data'
import { cardName } from '../pages/HomePage'

test.describe('Anime tab', () => {
  test('lists anime films and series, and nothing else', async ({ page, home }) => {
    await home.goto()
    await home.openCategory('Anime')

    const all = page.getByRole('heading', { name: 'All Anime' })
    await expect(all).toBeVisible()
    await expect(home.card(titleOf(ANIME_SHOW))).toBeVisible()
    await expect(home.card(titleOf(ANIME_MOVIE))).toBeVisible()

    // The browse rows sit above the grid and mount as they near the viewport
    await all.scrollIntoViewIfNeeded()
    const movies = page.getByRole('region', { name: 'Anime Movies' })
    await expect(movies.getByRole('button', { name: cardName(titleOf(ANIME_MOVIE)) })).toBeVisible()
    await expect(movies.getByRole('button', { name: cardName(titleOf(ANIME_SHOW)) })).toHaveCount(0)
    const series = page.getByRole('region', { name: 'Popular Anime Series' })
    await expect(series.getByRole('button', { name: cardName(titleOf(ANIME_SHOW)) })).toBeVisible()

    for (const media of [MOVIE, SECOND_MOVIE, SHOW]) {
      await expect(page.getByRole('button', { name: cardName(titleOf(media)) })).toHaveCount(0)
    }
  })

  test('searches only anime', async ({ page, home, mockApi }) => {
    await home.goto()
    await home.openCategory('Anime')

    // Found from Home (see browse.spec), but it isn't anime
    await home.search('incep')
    await expect(page.getByText('No results found')).toBeVisible()
    expect(mockApi.calls('GET', '/tmdb/search/hybrid').at(-1)!.query.get('anime')).toBe('true')

    await home.searchBox.fill('spirited')
    await expect(home.card(titleOf(ANIME_MOVIE))).toBeVisible()
  })

  test('plays an anime episode on Premium, looked up by the show’s IMDb id', async ({ page, home, watch, mockApi }) => {
    await home.goto()
    await home.openCategory('Anime')
    await home.card(titleOf(ANIME_SHOW)).click()

    await expect(page).toHaveURL(watchPath(ANIME_SHOW))
    await expect(watch.heading(ANIME_SHOW)).toBeVisible()
    await expect(watch.serverPicker).toContainText('Premium')

    await watch.play()
    await watch.expectPremiumPlaying()

    const search = mockApi.calls('GET', '/debrid/media-search').at(-1)!
    expect(search.query.get('imdb')).toBe(ANIME_SHOW.external_ids!.imdb_id)
    expect(search.query.get('type')).toBe('tv')
    expect(search.query.get('season')).toBe('1')
    expect(search.query.get('episode')).toBe('1')
  })

  test('plays an anime film on Premium', async ({ watch, mockApi }) => {
    await watch.goto(ANIME_MOVIE)
    await expect(watch.serverPicker).toContainText('Premium')

    await watch.play()
    await watch.expectPremiumPlaying()

    const search = mockApi.calls('GET', '/debrid/media-search').at(-1)!
    expect(search.query.get('imdb')).toBe(ANIME_MOVIE.imdb_id)
    expect(search.query.get('type')).toBe('movie')
  })
})
