import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

// admin/auth refuses to load without its secrets; set them before the router is imported.
process.env.ADMIN_TOTP_SECRET ||= 'test-totp-secret'
process.env.ADMIN_JWT_SECRET ||= 'test-jwt-secret'

/**
 * Premium (Real-Debrid) is admin-only. These go through a real HTTP server so
 * the test fails if any /debrid route is ever mounted ahead of the admin gate.
 */
describe('debrid routes are admin-only', () => {
  let server: Server
  let base = ''

  beforeAll(async () => {
    const { default: express } = await import('express')
    const { default: debridRouter } = await import('./debrid')
    const app = express()
    app.use(express.json())
    app.use('/debrid', debridRouter)
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server?.close()
  })

  const routes: Array<[method: string, path: string]> = [
    ['GET', '/debrid/status'],
    ['GET', '/debrid/media-search?title=Inception&imdb=tt1375666'],
    ['POST', '/debrid/play'],
    ['GET', '/debrid/play/ABCDEFGH12345'],
    ['GET', '/debrid/subtitles?imdb=tt1375666&type=movie'],
    ['GET', '/debrid/subtitles/file/12345'],
    ['DELETE', '/debrid/torrents/ABCDEFGH12345'],
  ]

  for (const [method, path] of routes) {
    it(`${method} ${path.split('?')[0]} refuses a guest`, async () => {
      const res = await fetch(base + path, { method })
      expect(res.status).toBe(401)
    })

    it(`${method} ${path.split('?')[0]} refuses a token that isn't an admin's`, async () => {
      const res = await fetch(base + path, {
        method,
        headers: { Authorization: 'Bearer not-an-admin-token' },
      })
      expect(res.status).toBe(401)
    })
  }

  it('no longer advertises a free promotion', async () => {
    const res = await fetch(`${base}/debrid/promo`)
    expect(res.status).toBe(401)
  })
})
