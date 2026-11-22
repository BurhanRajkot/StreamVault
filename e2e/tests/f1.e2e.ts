/**
 * The F1 archive: a season's race weekends, a weekend's sessions, and a
 * session to download (magnet links — anyone) or watch (Premium — the admin
 * and approved accounts in the app). Winners stay hidden until asked for, so
 * a race isn't spoilt. Deterministic: no agent steps.
 *
 * The mock serves two 2025 weekends; Abu Dhabi has the race and qualifying
 * on their own and a 4K pack of the whole weekend (fixtures/data.ts).
 */

import { expect } from 'e2e'
import { adminTest, test } from './fixtures'
import { F1_YEAR } from '../fixtures/data'

const SEASON = `/f1?season=${F1_YEAR}`
const ABU_DHABI = `/f1/${F1_YEAR}/24`

test('the header leads to the F1 archive', { tags: ['smoke'] }, async ({ app, screen, browser }) => {
  await app.open('/')
  const phone = (await browser.evaluate(() => window.innerWidth)) < 768
  await screen
    .getByRole('banner')
    .getByRole(phone ? 'tab' : 'link', 'F1')
    .tap()
  await expect(browser).toHaveURL(/\/f1$/)
  await expect(screen.getByRole('heading', /season$/, { level: 1 })).toBeVisible()
})

test('a season lists its race weekends, with the winners hidden until asked for', async ({ app, screen }) => {
  await app.open(SEASON)
  await expect(screen.getByRole('heading', `${F1_YEAR} season`, { level: 1 })).toBeVisible()
  const abuDhabi = screen.getByRole('link', /Abu Dhabi Grand Prix/)
  await expect(abuDhabi).toBeVisible()
  await expect(screen.getByRole('link', /Qatar Grand Prix/)).toContainText('Sprint')
  await expect(screen.getByText('Lando Norris')).toBeHidden()

  await screen.getByRole('button', 'Results hidden').tap()
  // On the latest race's card and on its row
  await expect(screen.getByText('Lando Norris').first()).toBeVisible()
  await expect(screen.getByRole('region', 'Latest race')).toContainText('Abu Dhabi Grand Prix')

  await abuDhabi.tap()
  await expect(screen.getByRole('heading', 'Abu Dhabi Grand Prix', { level: 1 })).toBeVisible()
})

test('anyone downloads a session as a magnet link; watching it is Premium', async ({ app, screen, mockApi }) => {
  await app.open(ABU_DHABI)
  await expect(screen.getByRole('heading', 'Abu Dhabi Grand Prix', { level: 1 })).toBeVisible()
  await expect(screen.getByText(/Watching uses Premium, which is invite-only/)).toBeVisible()
  await expect(screen.getByRole('button', 'Watch Race')).toBeDisabled()

  await screen.getByRole('button', 'Download Race').tap()
  const sheet = screen.getByRole('dialog', 'Download')
  await expect(sheet.getByRole('link', 'Open 1080p in torrent app')).toHaveAttribute('href', /^magnet:\?xt=urn:btih:/)
  // The 4K weekend pack holds the race too: the torrent app picks the session
  await expect(sheet.getByRole('link', 'Open 4K in torrent app')).toBeVisible()
  await expect(sheet.getByText('pick the session in your torrent app', { exact: false })).toBeVisible()
  // No subtitles to offer for a broadcast
  await expect(sheet.getByRole('tab', 'Subtitles')).toHaveCount(0)
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(0)
})

adminTest('the admin watches a session on Premium, the file asked for by session', async ({ app, screen, mockApi }) => {
  await app.open(ABU_DHABI)
  await screen.getByRole('link', 'Watch Race').tap()

  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  const [play] = mockApi.calls('POST', '/debrid/play')
  // The 1080p copy first: the 4K pack's HEVC doesn't play in this browser
  expect(play.body).toMatchObject({ session: 'race', name: 'formula1 2025 abu dhabi grand prix 1080p WEB H264-GROUP' })
  expect(play.admin).toBe(true)
})
