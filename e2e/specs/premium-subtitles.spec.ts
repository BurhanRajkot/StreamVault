/**
 * ⚡ Premium subtitles — on in English by default, matched to the file that's
 * playing; another language, another version, a timing nudge or Off from the
 * player's settings, remembered for the next title.
 */

import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import type { MockApi } from '../fixtures/mock-api'
import { MOVIE, SHOW, SUBTITLE_LANGUAGES, SUBTITLE_LINES, readyPlayback, subtitleFile } from '../fixtures/data'

function serveSubtitles(mockApi: MockApi) {
  mockApi.on('GET', '/debrid/subtitles', { json: { languages: SUBTITLE_LANGUAGES } })
  mockApi.on('GET', '/debrid/subtitles/file/:id', ({ params }) =>
    SUBTITLE_LINES[params.id] ? { text: subtitleFile(SUBTITLE_LINES[params.id]) } : { status: 404, json: { error: 'Subtitle not found' } }
  )
}

const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Player settings' })

test.describe('Premium subtitles', () => {
  test.beforeEach(({ mockApi }) => serveSubtitles(mockApi))

  test('show in English by default, for the file playing, and can be changed or turned off in Settings', async ({ page, watch, mockApi }) => {
    await watch.goto(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()

    const subtitles = watch.root.getByTestId('player-subtitles')
    await expect(subtitles).toHaveText(SUBTITLE_LINES['101'])
    const search = mockApi.calls('GET', '/debrid/subtitles')[0]
    expect(search.query.get('imdb')).toBe(MOVIE.imdb_id)
    expect(search.query.get('type')).toBe('movie')
    expect(search.query.get('fileName'), 'versions are ranked for the playing file').toBe(readyPlayback().fileName)

    // Paused, the controls stay up — no racing their auto-hide.
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
    await watch.root.getByRole('button', { name: /^Settings/ }).click()
    await settingsDialog(page).getByRole('button', { name: /^Subtitles/ }).click()
    await settingsDialog(page).getByRole('button', { name: 'Spanish', exact: true }).click()
    await expect(subtitles).toHaveText(SUBTITLE_LINES['201'])
    expect(mockApi.calls('GET', '/debrid/subtitles').at(-1)!.query.get('langs'), 'Spanish is searched in depth').toBe('spa')

    await settingsDialog(page).getByRole('button', { name: 'Off', exact: true }).click()
    await expect(subtitles).toHaveCount(0)

    // Remembered for the next play — and C brings back the last language.
    await page.reload()
    await watch.play()
    await watch.expectPremiumPlaying()
    const captions = watch.root.getByRole('button', { name: 'Subtitles (c)' })
    await expect(captions).toHaveAttribute('aria-pressed', 'false')
    await expect(subtitles).toHaveCount(0)
    await page.keyboard.press('c')
    await expect(subtitles).toHaveText(SUBTITLE_LINES['201'])
    await expect(captions).toHaveAttribute('aria-pressed', 'true')
  })

  test('an out-of-sync version can be swapped for another, and the timing nudged', async ({ page, watch }) => {
    await watch.goto(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()
    const subtitles = watch.root.getByTestId('player-subtitles')
    await expect(subtitles).toHaveText(SUBTITLE_LINES['101'])

    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
    await watch.root.getByRole('button', { name: /^Settings/ }).click()
    const settings = settingsDialog(page)
    await settings.getByRole('button', { name: /^Subtitles/ }).click()
    await settings.getByRole('button', { name: /^Version/ }).click()
    await expect(settings.getByRole('button', { name: /^Best match/ })).toHaveAttribute('aria-current', 'true')
    await settings.getByRole('button', { name: /^Version 2/ }).click()
    await expect(subtitles).toHaveText(SUBTITLE_LINES['102'])

    // One second later: the line, there from 0:00, now starts at 0:01.
    await settings.getByRole('button', { name: 'Show subtitles later' }).click()
    await settings.getByRole('button', { name: 'Show subtitles later' }).click()
    await expect(settings.getByRole('button', { name: /^Subtitle timing \+1\.0s/ })).toBeVisible()
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 0.4
    })
    await expect(subtitles).toHaveCount(0)
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 2
    })
    await expect(subtitles).toHaveText(SUBTITLE_LINES['102'])
  })

  test('a show’s subtitles are searched for the episode playing', async ({ watch, mockApi }) => {
    await watch.goto(SHOW)
    await watch.play()
    await watch.expectPremiumPlaying()
    await expect(watch.root.getByTestId('player-subtitles')).toBeVisible()

    const search = mockApi.calls('GET', '/debrid/subtitles').at(-1)!
    expect(search.query.get('type')).toBe('tv')
    expect(search.query.get('season')).toBe('1')
    expect(search.query.get('episode')).toBe('1')
  })

  test('without any, the player says so and carries on', async ({ page, watch, mockApi }) => {
    mockApi.on('GET', '/debrid/subtitles', { json: { languages: [] } })
    await watch.goto(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()

    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
    await watch.root.getByRole('button', { name: /^Settings/ }).click()
    await expect(settingsDialog(page).getByRole('button', { name: /^Subtitles/ })).toContainText('None found')
    await expect(watch.root.getByRole('button', { name: 'Subtitles (c)' })).toHaveCount(0)
  })
})
