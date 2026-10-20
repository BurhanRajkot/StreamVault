# End-to-end tests

Playwright tests that drive the **production build** in a real browser, the
way a viewer uses it. They are hermetic: the backend is an in-browser mock,
TMDB images and streaming embeds are stand-ins, and every other outside
request is blocked. A run needs no backend, database, API key or network, so
it behaves the same on a laptop and in CI.

```bash
npm run e2e                 # desktop + mobile Chromium (what CI runs on every push)
npm run e2e:smoke           # @smoke tests only, desktop — ~20 s
npm run e2e:all-browsers    # + Firefox, WebKit, mobile Safari (CI's weekly sweep)
npm run e2e:ui              # interactive runner, time-travel debugging
npm run e2e:report          # open the last HTML report
npx playwright test premium-player --project=desktop   # one file, one project
```

First time: `npx playwright install chromium` (add `firefox webkit` for
`e2e:all-browsers`). Playwright builds the app into `dist-e2e/` and serves it
on :4173 itself; an already-running server there is reused locally.

## Layout

```
e2e/
  specs/              one file per user journey
    premium-player    ⚡ Premium: default server, guest playback, fallbacks, promo end
    browse            home, search, title pages
    anime             the Anime tab: anime-only rows, grid and search; plays on Premium
    account           guest vs signed-in, favorites
    promo             the "Premium is free" announcement
    smoke             every route renders (@smoke, runs first in CI)
    accessibility     axe-core WCAG 2.1 AA audit (fails on critical)
  pages/              page objects — locators and multi-step actions
  fixtures/
    test.ts           the `test` to import: fixtures, options, teardown checks
    mock-api.ts       MockApi — the fake backend, with per-test overrides
    network.ts        the hermetic network policy
    data.ts           catalogue + factories (titles, releases, playback)
    media/sample.webm 8 s VP9/Opus clip the Premium player really plays
```

## Writing a test

```ts
import { test, expect, SIGNED_IN } from '../fixtures/test'
import { MOVIE, release } from '../fixtures/data'

test('plays the release the backend offers', async ({ watch, mockApi }) => {
  mockApi.on('GET', '/debrid/media-search', { json: { data: [release()] } })

  await watch.goto(MOVIE)
  await watch.play()

  await watch.expectPremiumPlaying()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(1)
})

test.describe('signed in', () => {
  test.use({ user: SIGNED_IN })
  // ...
})
```

- **Fixtures.** `page`, `home`, `watch`, `mockApi`. Options: `user`
  (default guest) and `firstVisit` (keep the disclaimer and promo card,
  which are otherwise pre-dismissed).
- **Backend.** Every test gets a fresh `MockApi` with a healthy default
  backend. Override an endpoint with `mockApi.on(method, path, response |
  handler)`. Paths take params (`/tmdb/:type(movie|tv)/:id(\d+)`), and
  `delayMs` holds a response back so you can assert loading states. Assert
  on what the app *sent* with `mockApi.calls(method, path)`.
- **Locators.** Use roles and accessible names first, the way users and
  screen readers find things. Fall back to `data-testid` only where there's
  no accessible handle (the video element, the title page's root). If a
  control has no accessible name, give it one in the app: that fixes the
  accessibility bug and the test in one go.
- **No sleeps.** Use web-first assertions (`await expect(locator)…`) and
  `expect.poll` for values that settle over time.
- **Both layouts.** Every test runs on desktop and mobile. Write it once
  against what both share. `test.skip(test.info().project.name === 'mobile',
  reason)` only when the feature truly doesn't exist on one of them.

## Guard rails (enforced on teardown)

A test fails if:

- the page threw an uncaught exception, or
- the app called an endpoint `MockApi` has no handler for. Add the handler
  rather than loosening the check: it's how the mock stays in step with the
  real backend.

## When it fails in CI

The job summary shows the counts. The `playwright-report` artifact has the
HTML report, and `playwright-results` has a trace, video and screenshot of
every failed test. Open a trace with `npx playwright show-trace trace.zip`.
CI retries a failure twice, and a test that passes on retry shows as
**flaky** in the report. Fix it; don't ignore it.
