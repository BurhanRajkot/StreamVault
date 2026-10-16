/**
 * Automated accessibility checks (axe-core, WCAG 2.1 A/AA) on the pages a
 * viewer spends their time on. Fails on critical violations; serious ones
 * are attached to the report so they're visible without blocking a merge.
 */

import AxeBuilder from '@axe-core/playwright'
import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { MOVIE } from '../fixtures/data'

async function audit(page: Page, testInfo: TestInfo) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Third-party embed content isn't ours to fix.
    .exclude('iframe')
    .analyze()

  await testInfo.attach('axe-violations.json', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  })

  const summary = (impact: string) =>
    violations
      .filter((v) => v.impact === impact)
      .map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`)

  for (const line of summary('serious')) testInfo.annotations.push({ type: 'a11y: serious', description: line })
  expect(summary('critical'), 'critical accessibility violations').toEqual([])
}

test('home page', async ({ page, home }, testInfo) => {
  await home.goto()
  await audit(page, testInfo)
})

test('title page', async ({ page, watch }, testInfo) => {
  await watch.goto(MOVIE)
  await audit(page, testInfo)
})

test('Premium player', async ({ page, watch }, testInfo) => {
  await watch.goto(MOVIE)
  await watch.play()
  await watch.expectPremiumPlaying()
  await audit(page, testInfo)
})
