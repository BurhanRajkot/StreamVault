import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

process.env.ADMIN_TOTP_SECRET ||= 'test-totp-secret'
process.env.ADMIN_JWT_SECRET ||= 'test-jwt-secret'
process.env.SUPABASE_URL ||= 'http://supabase.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key'

describe('admin user routes', () => {
  let server: Server
  let base = ''

  beforeAll(async () => {
    const { default: express } = await import('express')
    const { default: adminUsersRouter } = await import('./adminUsers')
    const { default: adminRouter } = await import('../admin/routes')
    const app = express()
    app.use(express.json())
    // Mounted exactly as in index.ts
    app.use('/admin', adminUsersRouter)
    app.use('/admin', adminRouter)
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server?.close()
  })

  for (const [method, path] of [
    ['GET', '/admin/users'],
    ['PATCH', '/admin/users/auth0|abc'],
    ['GET', '/admin/settings'],
    ['PUT', '/admin/settings/premium'],
  ] as const) {
    it(`${method} ${path} needs the admin token`, async () => {
      const res = await fetch(base + path, { method, headers: { Authorization: 'Bearer not-an-admin-token' } })
      expect(res.status).toBe(401)
    })
  }

  it('leaves the admin login reachable without a token', async () => {
    const res = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    // 400 "code required": the login route answered, not the Users panel's gate
    expect(res.status).toBe(400)
  })
})

describe('admin user route inputs', () => {
  it('accepts Auth0 ids and nothing else', async () => {
    const { USER_ID_RE } = await import('./adminUsers')
    expect(USER_ID_RE.test('auth0|65f1c2')).toBe(true)
    expect(USER_ID_RE.test('google-oauth2|1234567890')).toBe(true)
    expect(USER_ID_RE.test('auth0|x,id.eq.y')).toBe(false)
    expect(USER_ID_RE.test('../etc')).toBe(false)
  })

  it('strips what would break out of a PostgREST filter from a search', async () => {
    const { searchTerm } = await import('./adminUsers')
    expect(searchTerm('ann@example.com')).toBe('ann@example.com')
    expect(searchTerm('a),id.eq.(x')).toBe('aid.eq.x')
    expect(searchTerm('a')).toBeNull()
    expect(searchTerm(undefined)).toBeNull()
  })
})
