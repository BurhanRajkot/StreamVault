/**
 * Downloading what's playing: once a title is playing on an embed server
 * (Sol, the default), the watch screen still offers its download, for the
 * film or for the episode on screen.
 */

import { test, expect } from '../fixtures/test'
import { MOVIE, SHOW } from '../fixtures/data'

test.describe('Download while watching', () => {
  test('a show offers the playing episode, and only that', async ({ page, watch }) => {
    test.skip(test.info().project.name === 'mobile', 'The desktop theater; the phone has its own test below')
    await watch.goto(SHOW)
    await watch.play()
    await expect(watch.embed).toBeVisible()

    await watch.root.getByRole('button', { name: 'Download S1:E1' }).click()
    const sheet = page.getByRole('dialog', { name: 'Download' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('S1 · E1')
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    // One Download, for what's playing — the episode rows stay uncluttered
    await expect(watch.root.getByRole('button', { name: /^Download episode/ })).toHaveCount(0)
    await expect(watch.embed, 'the episode keeps playing underneath').toBeVisible()
  })

  test('a film offers itself', async ({ page, watch }) => {
    test.skip(test.info().project.name === 'mobile', 'The desktop theater; the phone has its own test below')
    await watch.goto(MOVIE)
    await watch.play()
    await expect(watch.embed).toBeVisible()

    await watch.root.getByRole('button', { name: 'Download', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Download' })).toBeVisible()
  })

  test('on a phone, the full-screen player keeps a download button beside Back', async ({ page, watch }) => {
    test.skip(test.info().project.name !== 'mobile', 'The phone’s full-screen player')
    await watch.goto(SHOW)
    await watch.play()
    await expect(watch.embed).toBeVisible()

    await watch.root.getByRole('button', { name: 'Download S1 E1' }).click()
    await expect(page.getByRole('dialog', { name: 'Download' })).toContainText('S1 · E1')
  })
})
