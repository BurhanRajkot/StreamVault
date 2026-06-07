/**
 * StreamVault E2E — Optional Ad / Tracker Blocking
 * Location: e2e/fixtures/adblock.ts
 *
 * Your embed/streaming providers serve ads when the iframe loads in a plain
 * Chromium that has no extensions. This wires Ghostery's adblocker (the
 * uBlock-Origin / EasyList-compatible engine) into the network layer, so it
 * blocks ads INSIDE the cross-origin player iframe too — no browser extension
 * and no real Brave binary required.
 *
 * It is OFF by default and only activates when E2E_ADBLOCK=1, so normal
 * fully-mocked CI runs are completely unaffected. Turn it on for real-server
 * runs (e.g. the @skip-ci playback test against your live CDN):
 *
 *   E2E_ADBLOCK=1 E2E_INCLUDE_SKIP_CI=1 \
 *     npx playwright test playback.spec.ts --project=chrome-real
 *
 * The heavy dependencies are imported DYNAMICALLY, so the suite still runs
 * even if the packages aren't installed — right up until you actually opt in:
 *
 *   npm i -D @ghostery/adblocker-playwright cross-fetch
 */

import path from 'path'
import { promises as fs } from 'fs'
import type { BrowserContext } from '@playwright/test'

export const AD_BLOCK_ENABLED = process.env.E2E_ADBLOCK === '1'

// Cache the compiled engine for the whole run (and on disk between runs).
let blockerPromise: Promise<any> | null = null

async function getBlocker(): Promise<any> {
  if (blockerPromise) return blockerPromise

  blockerPromise = (async () => {
    // Non-literal specifiers keep TypeScript from requiring the optional deps.
    const adblockPkg = '@ghostery/adblocker-playwright'
    const fetchPkg = 'cross-fetch'
    const { PlaywrightBlocker } = await import(adblockPkg)
    const fetchMod = await import(fetchPkg)
    const crossFetch = fetchMod.default ?? fetchMod

    const enginePath = path.resolve(process.cwd(), 'node_modules/.cache/sv-adblocker-engine.bin')
    return PlaywrightBlocker.fromPrebuiltAdsAndTracking(crossFetch, {
      path: enginePath,
      read: fs.readFile,
      write: async (p: string, data: Uint8Array) => {
        await fs.mkdir(path.dirname(p), { recursive: true })
        await fs.writeFile(p, data)
      },
    })
  })()

  return blockerPromise
}

/**
 * Enable ad/tracker blocking for an entire browser context.
 *
 * Applied at the CONTEXT level so any per-page `page.route` API mocks still
 * take priority — the blocker only handles requests the mocks don't claim
 * (e.g. ad/tracker domains loaded inside the provider iframe).
 *
 * No-op unless E2E_ADBLOCK=1.
 */
export async function enableAdBlock(context: BrowserContext): Promise<void> {
  if (!AD_BLOCK_ENABLED) return
  const blocker = await getBlocker()
  await blocker.enableBlockingInContext(context)
}
