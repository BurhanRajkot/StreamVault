/**
 * ⚡ Premium (Real-Debrid) — the last server in the list since 2026-11-13
 * (Sol, Vidy's player, is the default), free for everyone, guests included,
 * while the promotion runs. These tests pick it, as a viewer would.
 */

import type { Page } from '@playwright/test'
import { test, expect, SIGNED_IN } from '../fixtures/test'
import { EMBED_STUB_TEXT } from '../fixtures/network'
import { CONVERTED_STREAM_URL, MOVIE, SAMPLE_VIDEO_URL, SHOW, convertedPlayback, readyPlayback, release } from '../fixtures/data'

test.describe('Server list', () => {
  test('Sol is the server selected by default for movies and shows', async ({ watch }) => {
    await watch.goto(MOVIE)
    await expect(watch.serverPicker).toContainText('Sol')

    await watch.goto(SHOW)
    await expect(watch.serverPicker).toContainText('Sol')
  })

  test('lists Sol (4K) first, then the stars, and Premium last', async ({ page, watch }) => {
    await watch.goto(MOVIE)
    await watch.serverPicker.click()

    const options = page.getByRole('option')
    await expect(options.first()).toHaveText(/^Sol\s*4K$/)
    await expect(options.nth(1)).toHaveText('Sirius')
    await expect(options.last()).toHaveText(/^Premium\s*4K\/1080p/)
  })

  test('Sol plays in an embed, from vidy.st', async ({ watch }) => {
    await watch.goto(MOVIE)
    await watch.play()

    await expect(watch.embed).toHaveAttribute('src', new RegExp(`^https://www\\.vidy\\.st/movie/${MOVIE.id}\\?`))
    await expect(watch.embedFrame.getByText(EMBED_STUB_TEXT)).toBeVisible()
    await expect(watch.premiumVideo).toHaveCount(0)
  })
})

test.describe('Premium server', () => {
  test('a guest can play a movie without signing in', async ({ watch, mockApi }) => {
    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await watch.expectPremiumPlaying()

    const [search] = mockApi.calls('GET', '/debrid/media-search')
    expect(search.authenticated, 'a guest sends no token').toBe(false)
    expect(search.query.get('imdb')).toBe(MOVIE.imdb_id)
    expect(search.query.get('type')).toBe('movie')
    expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(1)
  })

  test('a guest can play a TV episode, and the episode picked is the one requested', async ({ page, watch, mockApi }) => {
    await watch.gotoOnPremium(SHOW)
    if (test.info().project.name === 'mobile') {
      // A phone's title page lists the episodes; tapping one plays it
      await page.getByRole('region', { name: 'Episodes' }).getByRole('button', { name: /^Episode 3: / }).click()
    } else {
      await page.getByRole('combobox', { name: 'Episode' }).click()
      await page.getByRole('option', { name: 'Episode 3', exact: true }).click()
      await watch.play()
    }

    await watch.expectPremiumPlaying()

    const search = mockApi.calls('GET', '/debrid/media-search').at(-1)!
    expect(search.query.get('type')).toBe('tv')
    expect(search.query.get('season')).toBe('1')
    expect(search.query.get('episode')).toBe('3')
  })

  test.describe('signed in', () => {
    test.use({ user: SIGNED_IN })

    test('plays with the user’s token attached', async ({ watch, mockApi }) => {
      await watch.gotoOnPremium(MOVIE)
      await watch.play()

      await watch.expectPremiumPlaying()
      expect(mockApi.calls('POST', '/debrid/play')[0].authenticated).toBe(true)
    })
  })

  test('finds the releases while the details are still open, so Play starts one at once', async ({ watch, mockApi }) => {
    await watch.gotoOnPremium(MOVIE)
    await expect.poll(() => mockApi.calls('GET', '/debrid/media-search').length, { message: 'searched before Play' }).toBe(1)

    await watch.play()

    await watch.expectPremiumPlaying()
    expect(mockApi.calls('GET', '/debrid/media-search'), 'Play reused that search').toHaveLength(1)
  })

  test('shows each step while it starts a stream', async ({ watch, mockApi }) => {
    let finishSearch!: () => void
    const searchDone = new Promise<void>((resolve) => (finishSearch = resolve))
    mockApi.on('GET', '/debrid/media-search', async () => {
      await searchDone
      return { json: { data: [release()] } }
    })
    let finishPlay!: () => void
    const playDone = new Promise<void>((resolve) => (finishPlay = resolve))
    mockApi.on('POST', '/debrid/play', async () => {
      await playDone
      return { json: readyPlayback() }
    })

    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    const steps = watch.premiumLoading.getByRole('progressbar', { name: 'Loading the stream' })
    await expect(watch.premiumLoading).toContainText('Finding the best stream')
    await expect(steps).toHaveAttribute('aria-valuetext', /^Step 1 of 3/)

    finishSearch()
    await expect(watch.premiumLoading).toContainText('Starting the 1080p stream')
    await expect(steps).toHaveAttribute('aria-valuetext', /^Step 2 of 3/)

    finishPlay()
    await watch.expectPremiumPlaying()
  })

  test.describe('when its first pick only plays converted', () => {
    // Ranked in this order: seeders break the tie between the two 1080p AAC releases.
    const first = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-FIRST', seeders: '900' })
    const second = release({ name: 'Inception.2010.1080p.WEBRip.x264.AAC-SECOND', seeders: '50' })
    const third = release({ name: 'Inception.2010.720p.WEBRip.x264.AAC-THIRD', seeders: '40' })
    const dolby = release({ name: 'Inception.2010.1080p.WEB-DL.DDP5.1.x264-DOLBY', seeders: '30' })
    const hashesPlayed = (calls: { body: unknown }[]) => calls.map((c) => (c.body as { hash: string }).hash)

    test('asks about the next releases that could play directly together, and plays one', async ({ watch, mockApi }) => {
      mockApi.on('GET', '/debrid/media-search', { json: { data: [dolby, third, second, first] } })
      let thirdAsked!: () => void
      const thirdAskedYet = new Promise<void>((resolve) => (thirdAsked = resolve))
      mockApi.on('POST', '/debrid/play', async ({ body }) => {
        const { hash } = body as { hash: string }
        if (hash === first.info_hash) return { json: convertedPlayback() }
        if (hash === third.info_hash) thirdAsked()
        // Answers only once the third has been asked about too — one at a time would never get here
        if (hash === second.info_hash) await thirdAskedYet
        return { json: readyPlayback() }
      })

      await watch.gotoOnPremium(MOVIE)
      await watch.play()

      await watch.expectPremiumPlaying()
      await expect(watch.premiumVideo, 'the file itself, not the converted stream').toHaveAttribute('src', SAMPLE_VIDEO_URL)
      expect(hashesPlayed(mockApi.calls('POST', '/debrid/play')), 'never the Dolby one').toEqual([
        first.info_hash,
        second.info_hash,
        third.info_hash,
      ])
    })

    test('plays it converted straight away when nothing else could play directly', async ({ watch, mockApi }) => {
      mockApi.on('GET', '/debrid/media-search', { json: { data: [dolby, first] } })
      mockApi.on('POST', '/debrid/play', ({ body }) =>
        (body as { hash: string }).hash === first.info_hash ? { json: convertedPlayback() } : { json: readyPlayback() }
      )

      await watch.gotoOnPremium(MOVIE)
      await watch.play()

      await watch.expectPremiumPlaying()
      expect(hashesPlayed(mockApi.calls('POST', '/debrid/play'))).toEqual([first.info_hash])
    })
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

    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await watch.expectPremiumPlaying()
    const tried = mockApi.calls('POST', '/debrid/play').map((c) => (c.body as { hash: string }).hash)
    expect(tried).toEqual([broken.info_hash, good.info_hash])
  })

  test('offers the other instant releases in the player’s Quality menu', async ({ watch, mockApi }) => {
    const hd = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-HD' })
    const uhd = release({ name: 'Inception.2010.2160p.UHD.BluRay.x265.HDR.AAC-UHD' })
    mockApi.on('GET', '/debrid/media-search', { json: { data: [uhd, hd] } })

    await watch.gotoOnPremium(MOVIE)
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

  // Downloads are stopped for now (34dbfc9): the Download link that sat beside
  // this picker is hidden. When it's back, assert its href follows the release.
  test('under the player, the release can be switched', async ({ page, watch, mockApi }) => {
    test.skip(test.info().project.name === 'mobile', 'A phone plays full screen — the same choices are in the player’s menus')
    const hd = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-HD' })
    const uhd = release({ name: 'Inception.2010.2160p.UHD.BluRay.x265.HDR.AAC-UHD' })
    mockApi.on('GET', '/debrid/media-search', { json: { data: [uhd, hd] } })
    mockApi.on('POST', '/debrid/play', ({ body }) => {
      const file = (body as { hash: string }).hash === uhd.info_hash ? 'Inception.2160p.mkv' : 'Inception.1080p.mkv'
      return { json: readyPlayback({ fileName: file, directUrl: `${SAMPLE_VIDEO_URL}?file=${file}` }) }
    })

    await watch.gotoOnPremium(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()

    const releasePicker = page.getByRole('combobox', { name: 'Release' })
    await expect(releasePicker).toContainText('1080p')

    await releasePicker.click()
    await page.getByRole('option', { name: /^4K/ }).click()

    await watch.expectPremiumPlaying()
    await expect(releasePicker).toContainText('4K')
    const played = mockApi.calls('POST', '/debrid/play').map((c) => (c.body as { hash: string }).hash)
    expect(played).toEqual([hd.info_hash, uhd.info_hash])
  })

  test.describe('a file the browser can’t decode, converted by Real-Debrid', () => {
    test.beforeEach(({ mockApi }) => {
      mockApi.on('POST', '/debrid/play', { json: convertedPlayback() })
    })

    /** Resolves with the next request for the converted stream's playlist — its `t` start offset, or null. */
    const nextPlaylistStart = (page: Page) =>
      page
        .waitForRequest((r) => r.url().startsWith(CONVERTED_STREAM_URL))
        .then((r) => new URL(r.url()).searchParams.get('t'))

    test('resumes mid-way, and a jump back before that point restarts the conversion there', async ({ page, watch }) => {
      await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ t: 60, d: 90, at: Date.now() })), `sv:resume:${MOVIE.imdb_id}`)
      await watch.gotoOnPremium(MOVIE)

      const resumed = nextPlaylistStart(page)
      await watch.play()
      expect(await resumed, 'the conversion starts at the resume point').toBe('60')
      await watch.expectPremiumPlaying()
      await expect(watch.seekBar).toHaveAttribute('aria-valuetext', /^1:0\d of 1:30$/)

      const restarted = nextPlaylistStart(page)
      await watch.seekBar.focus()
      await page.keyboard.press('Home')
      expect(await restarted, 'the conversion restarts from the beginning').toBeNull()
      await watch.expectPremiumPlaying()
      await expect(watch.seekBar).toHaveAttribute('aria-valuetext', /^0:0\d of 1:30$/)
    })
  })

  test('Back leaves the player for the title’s details', async ({ watch }) => {
    await watch.gotoOnPremium(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()

    await watch.root.getByRole('button', { name: 'Back to details' }).click()

    await expect(watch.premiumVideo).toHaveCount(0)
    await expect(watch.playButton).toBeVisible()
  })

  test('offers another server when it has no stream, and that server plays', async ({ page, watch, mockApi }) => {
    mockApi.on('GET', '/debrid/media-search', { json: { data: [] } })

    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await expect(page.getByText('No Premium stream available')).toBeVisible()
    await page.getByRole('button', { name: 'Switch server' }).first().click()
    await page.getByRole('option', { name: 'Sirius' }).click()

    await expect(watch.embed).toBeVisible()
    await expect(watch.embedFrame.getByText(EMBED_STUB_TEXT)).toBeVisible()
    await expect(watch.premiumVideo).toHaveCount(0)
  })

  test('a viewer can still pick an embed server up front', async ({ watch }) => {
    await watch.goto(MOVIE)
    await watch.chooseServer('Canopus')
    await watch.play()

    await expect(watch.embedFrame.getByText(EMBED_STUB_TEXT)).toBeVisible()
  })

  test.describe('after the free promotion ends', () => {
    test('a guest is asked to sign in instead', async ({ page, watch, mockApi }) => {
      mockApi.state.promoFreeUntil = null
      mockApi.on('GET', '/debrid/media-search', ({ authenticated }) =>
        authenticated ? { json: { data: [release()] } } : { status: 401, json: { error: 'Unauthorized' } }
      )

      await watch.gotoOnPremium(MOVIE)
      await expect(watch.serverPicker).not.toContainText('Free')
      await watch.play()

      await expect(page.getByText('Premium is for subscribers')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    })
  })
})

test.describe('Seek bar', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name === 'mobile', 'Pointing at the bar needs a mouse')
  })

  test('pointing at it shows the frame and the time there', async ({ page, watch }) => {
    await watch.gotoOnPremium(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()
    // Paused, the controls stay up — no racing their auto-hide.
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())

    const bar = (await watch.seekBar.boundingBox())!
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)

    const preview = watch.root.getByTestId('seek-preview')
    await expect(preview).toContainText('0:04')
    await expect(preview.getByTestId('seek-preview-frame'), 'a frame from that spot').toHaveAttribute('data-ready', 'true')
  })
})

test.describe('fits the screen', () => {
  test.describe('a laptop', () => {
    test.use({ viewport: { width: 1366, height: 768 } })
    test.beforeEach(() => {
      test.skip(test.info().project.name === 'mobile', 'A desktop window')
    })

    test('the whole 16:9 player, controls included, is on screen without scrolling', async ({ watch }) => {
      await watch.gotoOnPremium(MOVIE)
      await watch.play()
      await watch.expectPremiumPlaying()

      const player = (await watch.premiumVideo.boundingBox())!
      expect(player.y + player.height).toBeLessThanOrEqual(768)
      expect(player.width / player.height).toBeCloseTo(16 / 9, 1)
      await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
      await expect(watch.seekBar).toBeInViewport({ ratio: 1 })
    })
  })

  test.describe('a phone turned sideways', () => {
    test.use({ viewport: { width: 915, height: 412 } })
    test.beforeEach(() => {
      test.skip(test.info().project.name !== 'mobile', 'A touch screen')
    })

    test('fills the screen exactly, and the picture can be zoomed to fill it', async ({ page, watch }) => {
      await watch.gotoOnPremium(MOVIE)
      await watch.play()
      await watch.expectPremiumPlaying()

      expect(await watch.premiumVideo.boundingBox()).toEqual({ x: 0, y: 0, width: 915, height: 412 })
      await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
      await expect(watch.seekBar).toBeInViewport({ ratio: 1 })

      // A 16:9 picture on a ~20:9 screen
      const objectFit = () => watch.premiumVideo.evaluate((v: HTMLVideoElement) => getComputedStyle(v).objectFit)
      expect(await objectFit()).toBe('contain')
      await watch.root.getByRole('button', { name: 'Zoom to fill' }).click()
      expect(await objectFit()).toBe('cover')
      await watch.root.getByRole('button', { name: 'Fit to screen' }).click()
      expect(await objectFit()).toBe('contain')
      await expect(page.getByRole('button', { name: 'Zoom to fill' })).toBeVisible()
    })
  })
})

test.describe('Downloads', () => {
  test('the player’s settings offer the playing file', async ({ page, watch }) => {
    test.skip(true, 'Downloads are stopped for now: the player’s Settings menu has no Download row')
    await watch.gotoOnPremium(MOVIE)
    await watch.play()
    await watch.expectPremiumPlaying()
    // Paused, the controls stay up — no racing their auto-hide.
    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())

    await watch.root.getByRole('button', { name: /^Settings/ }).click()
    await expect(page.getByRole('dialog', { name: 'Player settings' }).getByRole('link', { name: /^Download/ })).toHaveAttribute(
      'href',
      SAMPLE_VIDEO_URL
    )
  })

  test('the title page hands out a magnet link, never a Real-Debrid one', async ({ page, watch, mockApi }) => {
    const hd = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-HD' })
    const unshared = release({ name: 'Inception.2010.720p.WEB.x264-NOONE', seeders: '0' })
    mockApi.on('GET', '/debrid/media-search', { json: { data: [hd, unshared] } })

    await watch.goto(MOVIE)
    await watch.root.getByRole('button', { name: /^Download/ }).click()

    const sheet = page.getByRole('dialog', { name: 'Download' })
    await expect(sheet.getByRole('link', { name: 'Open 1080p in torrent app' })).toHaveAttribute(
      'href',
      new RegExp(`^magnet:\\?xt=urn:btih:${hd.info_hash.toLowerCase()}&dn=`)
    )
    await expect(sheet.getByRole('button', { name: 'Copy 1080p magnet link' })).toBeVisible()
    await expect(sheet.getByText(unshared.name), 'a release no one is sharing isn’t offered').toHaveCount(0)
    await expect(watch.premiumVideo, 'nothing plays').toHaveCount(0)
    expect(mockApi.calls('POST', '/debrid/play'), 'Real-Debrid is never asked for the file').toHaveLength(0)
  })
})

test.describe('on a phone', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile', 'The phone title page and full-screen player')
  })

  test('the title page offers Play and Download, and a show’s episodes', async ({ page, watch }) => {
    await watch.goto(SHOW)

    await expect(watch.playButton).toBeVisible()
    await expect(watch.root.getByRole('button', { name: /^Download S1:E1$/ })).toBeVisible()
    const episodes = page.getByRole('region', { name: 'Episodes' })
    await expect(episodes.getByRole('listitem')).toHaveCount(7)
    await expect(episodes.getByRole('button', { name: /^Download episode/ }), 'one Download, not one per episode').toHaveCount(0)
  })

  test('playing leaves nothing else on screen, and the player’s Episodes panel switches episode', async ({ page, watch, mockApi }) => {
    await watch.gotoOnPremium(SHOW)
    await watch.play()
    await watch.expectPremiumPlaying()

    await expect(page.getByRole('region', { name: 'Episodes' }), 'the title page’s list is gone').toHaveCount(0)
    await expect(watch.serverPicker).toHaveCount(0)

    await watch.premiumVideo.evaluate((v: HTMLVideoElement) => v.pause())
    await watch.root.getByRole('button', { name: 'Episodes' }).click()
    await page.getByRole('dialog', { name: 'Episodes' }).getByRole('button', { name: /^Episode 3: / }).click()

    await watch.expectPremiumPlaying()
    const search = mockApi.calls('GET', '/debrid/media-search').at(-1)!
    expect(search.query.get('episode')).toBe('3')
  })
})
