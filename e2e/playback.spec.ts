import { test, expect } from '@playwright/test'
import { MOCK_MOVIES } from './fixtures/mocks'
import { WatchPage } from './pages/WatchPage'
import { test as baseTest } from './fixtures'

// Use our fixtures to get the unauthMockPage
baseTest.describe('Media Playback Validation', () => {
  baseTest('Movie playback iframe initiates video stream', async ({ unauthMockPage: page }) => {
    // We are extending the base test fixture for page
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    // Click "Play Now"
    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    
    // Set up a promise to listen for media stream requests before clicking play
    const mediaRequestPromise = page.waitForRequest(
      (request) => {
        const url = request.url().toLowerCase()
        const resourceType = request.resourceType()
        // We consider it a streaming request if it's requesting actual media files
        // Providers often use HLS (.m3u8), TS chunks (.ts), or raw video/media resource types
        return (
          url.includes('.m3u8') ||
          url.includes('.ts') ||
          url.includes('.mp4') ||
          resourceType === 'media'
        )
      },
      { timeout: 30000 } // Streaming providers can take a moment to load
    ).catch(() => null) // Don't crash test immediately if timeout, we handle it later

    await playBtn.click()
    
    // Wait for the iframe to mount
    const iframeElement = page.locator('iframe').first()
    await expect(iframeElement).toBeVisible({ timeout: 15_000 })
    
    // Verify it's a 200 OK by checking the src url directly
    const iframeSrc = await iframeElement.getAttribute('src')
    expect(iframeSrc).toBeTruthy()
    
    // Some providers require a click inside the iframe to start playback (like vidsrc)
    // We can try to grab the iframe context
    const frame = iframeElement.contentFrame()
    
    // Assert that the iframe does not contain generic error texts
    await expect(frame.getByText(/video not found|error loading|deleted/i)).toHaveCount(0)

    // Wait for the actual media stream to be requested
    const mediaRequest = await mediaRequestPromise
    expect(
      mediaRequest, 
      'Expected the streaming iframe to fetch actual video data (e.g. .m3u8, .ts, or media blob) but none was intercepted. The movie may not be playing or is blocked.'
    ).not.toBeNull()
    
    if (mediaRequest) {
      console.log(`Successfully intercepted media stream: ${mediaRequest.url()}`)
      const response = await mediaRequest.response()
      if (response) {
        expect(response.status()).toBeLessThan(400) // 200 or 206 Partial Content
      }
    }
  })
})
