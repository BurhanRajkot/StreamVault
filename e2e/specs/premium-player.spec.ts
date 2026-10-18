/**
 * ⚡ Premium (Real-Debrid) — the default server for every movie and episode,
 * free for everyone, guests included, while the promotion runs.
 */

import { test, expect, SIGNED_IN } from '../fixtures/test'
import { EMBED_STUB_TEXT } from '../fixtures/network'
import { MOVIE, SHOW, readyPlayback, release } from '../fixtures/data'

test.describe('Premium server', () => {
  test('is the server selected by default for movies and shows', async ({ watch }) => {
    await watch.goto(MOVIE)
    await expect(watch.serverPicker).toContainText('Premium')

    await watch.goto(SHOW)
    await expect(watch.serverPicker).toContainText('Premium')
  })

  test('is listed first, ahead of every embed server, and labelled free', async ({ page, watch }) => {
    await watch.goto(MOVIE)
    await watch.serverPicker.click()

    const options = page.getByRole('option')
    await expect(options.first()).toHaveText(/^Premium\s*4K\/1080p\s*Free$/)
    await expect(options.nth(1)).toHaveText('Mercury')
  })

  test('a guest can play a movie without signing in', async ({ watch, mockApi }) => {
    await watch.goto(MOVIE)
    await watch.play()

    await watch.expectPremiumPlaying()

    const [search] = mockApi.calls('GET', '/debrid/media-search')
    expect(search.authenticated, 'a guest sends no token').toBe(false)
    expect(search.query.get('imdb')).toBe(MOVIE.imdb_id)
    expect(search.query.get('type')).toBe('movie')
    expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(1)
  })

  test('a guest can play a TV episode, and the episode picked is the one requested', async ({ page, watch, mockApi }) => {
    await watch.goto(SHOW)
    await page.getByRole('combobox', { name: 'Episode' }).click()
    await page.getByRole('option', { name: 'Episode 3', exact: true }).click()
    await watch.play()

    await watch.expectPremiumPlaying()

    const search = mockApi.calls('GET', '/debrid/media-search').at(-1)!
    expect(search.query.get('type')).toBe('tv')
    expect(search.query.get('season')).toBe('1')
    expect(search.query.get('episode')).toBe('3')
  })

  test.describe('signed in', () => {
    test.use({ user: SIGNED_IN })

    test('plays with the user’s token attached', async ({ watch, mockApi }) => {
      await watch.goto(MOVIE)
      await watch.play()

      await watch.expectPremiumPlaying()
      expect(mockApi.calls('POST', '/debrid/play')[0].authenticated).toBe(true)
    })
  })

  test('shows its progress while it finds a stream', async ({ watch, mockApi }) => {
    mockApi.on('GET', '/debrid/media-search', { delayMs: 1_500, json: { data: [release()] } })

    await watch.goto(MOVIE)
    await watch.play()

    await expect(watch.premiumLoading).toBeVisible()
    await expect(watch.premiumLoading).toContainText('Finding the best stream')
    await watch.expectPremiumPlaying()
  })

  test('moves on to the next release when one can’t be played', async ({ watch, mockApi }) => {
    const broken = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-BROKEN', seeders: '900' })
    const good = release({ name: 'Inception.2010.1080p.WEB-DL.x264.AAC-GOOD', seeders: '10' })
    mockApi.on('GET', '/debrid/media-search', { json: { data: [broken, good] } })
    mockApi.on('POST', '/debrid/play', ({ body }) => {
      const { hash } = body as { hash: string }
      return hash === broken.info_hash
        ? { json: { status: 'failed', torrentId: 'BROKEN1234567', debridStatus: 'error', reason: 'dead torrent' } }
        : { json: readyPlayback() }
    })

    await watch.goto(MOVIE)
    await watch.play()

    await watch.expectPremiumPlaying()
    const tried = mockApi.calls('POST', '/debrid/play').map((c) => (c.body as { hash: string }).hash)
    expect(tried).toEqual([broken.info_hash, good.info_hash])
  })

  test('offers the other instant releases in the player’s Quality menu', async ({ watch, mockApi }) => {
    const hd = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-HD' })
    const uhd = release({ name: 'Inception.2010.2160p.UHD.BluRay.x265.HDR.AAC-UHD' })
    mockApi.on('GET', '/debrid/media-search', { json: { data: [uhd, hd] } })

    await watch.goto(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()
    // Paused, the controls stay up — no racing their auto-hide.
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())

    await watch.root.getByRole('button', { name: 'Settings' }).click()
    await watch.root.getByRole('button', { name: /^Quality/ }).click()
    await watch.root.getByRole('button', { name: /^4K/ }).click()

    await watch.expectPremiumPlaying()
    const played = mockApi.calls('POST', '/debrid/play').map((c) => (c.body as { hash: string }).hash)
    expect(played, 'starts on the 1080p release the browser decodes, then switches').toEqual([hd.info_hash, uhd.info_hash])
  })

  test('Back leaves the player for the title’s details', async ({ watch }) => {
    await watch.goto(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()

    await watch.root.getByRole('button', { name: 'Back to details' }).click()

    await expect(watch.premiumVideo).toHaveCount(0)
    await expect(watch.playButton).toBeVisible()
  })

  test('offers another server when it has no stream, and that server plays', async ({ page, watch, mockApi }) => {
    mockApi.on('GET', '/debrid/media-search', { json: { data: [] } })

    await watch.goto(MOVIE)
    await watch.play()

    await expect(page.getByText('No Premium stream available')).toBeVisible()
    await page.getByRole('button', { name: 'Switch server' }).first().click()
    await page.getByRole('option', { name: 'Mercury' }).click()

    await expect(watch.embed).toBeVisible()
    await expect(watch.embedFrame.getByText(EMBED_STUB_TEXT)).toBeVisible()
    await expect(watch.premiumVideo).toHaveCount(0)
  })

  test('a viewer can still pick an embed server up front', async ({ watch }) => {
    await watch.goto(MOVIE)
    await watch.chooseServer('Venus')
    await watch.play()

    await expect(watch.embedFrame.getByText(EMBED_STUB_TEXT)).toBeVisible()
  })

  test.describe('after the free promotion ends', () => {
    test('a guest is asked to sign in instead', async ({ page, watch, mockApi }) => {
      mockApi.state.promoFreeUntil = null
      mockApi.on('GET', '/debrid/media-search', ({ authenticated }) =>
        authenticated ? { json: { data: [release()] } } : { status: 401, json: { error: 'Unauthorized' } }
      )

      await watch.goto(MOVIE)
      await expect(watch.serverPicker).toHaveText(/Premium\s*4K\/1080p$/)
      await watch.play()

      await expect(page.getByText('Premium is for subscribers')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    })
  })
})
