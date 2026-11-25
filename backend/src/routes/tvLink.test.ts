import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

process.env.AUTH0_DOMAIN = 'tenant.example.auth0.com'

let mod: typeof import('./tvLink')

beforeAll(async () => {
  mod = await import('./tvLink')
})

const AUTHORIZE = 'https://tenant.example.auth0.com/authorize?client_id=abc&state=s1&code_challenge=cc&redirect_uri=https%3A%2F%2Fstream-vault.site'

describe('codes', () => {
  it('are six characters a person can read off a TV', () => {
    for (let i = 0; i < 50; i++) expect(mod.newCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
  })

  it('are read however they were typed', () => {
    expect(mod.normalizeCode('abc-234')).toBe('ABC234')
    expect(mod.normalizeCode(' ab c2 34 ')).toBe('ABC234')
  })

  it('refuse what cannot be a code', () => {
    expect(mod.normalizeCode('ABC23')).toBeNull()
    expect(mod.normalizeCode('ABC10O')).toBeNull()
    expect(mod.normalizeCode(['ABC234'])).toBeNull()
  })
})

describe('parseAuthorizeUrl', () => {
  it('keeps the tenant’s authorize address', () => {
    expect(mod.parseAuthorizeUrl(AUTHORIZE)).toBe(AUTHORIZE)
  })

  it('never sends the phone anywhere else', () => {
    expect(mod.parseAuthorizeUrl(AUTHORIZE.replace('tenant.example.auth0.com', 'evil.example'))).toBeNull()
    expect(mod.parseAuthorizeUrl(AUTHORIZE.replace('/authorize', '/v2/logout'))).toBeNull()
    expect(mod.parseAuthorizeUrl(AUTHORIZE.replace('https:', 'http:'))).toBeNull()
    expect(mod.parseAuthorizeUrl(AUTHORIZE.replace('auth0.com/', 'auth0.com:8443/'))).toBeNull()
    expect(mod.parseAuthorizeUrl('https://tenant.example.auth0.com/authorize?client_id=abc')).toBeNull()
  })
})

describe('parseReturnSearch', () => {
  it('keeps the code and state only', () => {
    expect(mod.parseReturnSearch('?code=c1&state=s1&evil=1')).toBe('?code=c1&state=s1')
  })

  it('keeps a refusal', () => {
    expect(mod.parseReturnSearch('?error=access_denied&error_description=No&state=s1')).toBe('?state=s1&error=access_denied&error_description=No')
  })

  it('needs a state and a code or an error', () => {
    expect(mod.parseReturnSearch('?code=c1')).toBeNull()
    expect(mod.parseReturnSearch('?state=s1')).toBeNull()
    expect(mod.parseReturnSearch(42)).toBeNull()
  })
})

describe('tv-link routes', () => {
  let server: Server
  let base = ''

  beforeAll(async () => {
    const { default: express } = await import('express')
    const app = express()
    app.use(express.json())
    app.use('/tv-link', mod.default)
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/tv-link`
  })

  afterAll(() => {
    server?.close()
  })

  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('carries a sign-in from the phone to the TV', async () => {
    const created = await post('', { authorizeUrl: AUTHORIZE })
    expect(created.status).toBe(201)
    const { code, secret } = (await created.json()) as { code: string; secret: string }

    // The TV asks before anything happened: no wait when its last view differs
    const first = await post(`/${code}/wait`, { secret })
    expect(await first.json()).toEqual({ status: 'waiting' })

    // The phone opens the code (typed in lower case, with a dash)
    const phone = await fetch(`${base}/${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`)
    expect(await phone.json()).toEqual({ authorizeUrl: AUTHORIZE })

    // The TV, having seen "waiting", is told it was opened
    const opened = await post(`/${code}/wait`, { secret, seen: 'waiting' })
    expect(await opened.json()).toEqual({ status: 'opened' })

    // The TV waits; the phone comes back from Auth0 meanwhile
    const waiting = post(`/${code}/wait`, { secret, seen: 'opened' })
    await new Promise((resolve) => setTimeout(resolve, 300))
    const done = await post(`/${code}/complete`, { search: '?code=auth-code&state=s1' })
    expect(done.status).toBe(204)
    const answer = await waiting
    expect(await answer.json()).toEqual({ status: 'done', search: '?code=auth-code&state=s1' })

    // Handed over once: the link is gone
    expect((await post(`/${code}/wait`, { secret })).status).toBe(410)
    expect((await fetch(`${base}/${code}`)).status).toBe(404)
  })

  it('answers only the TV that holds the secret', async () => {
    const { code } = (await (await post('', { authorizeUrl: AUTHORIZE })).json()) as { code: string }
    expect((await post(`/${code}/wait`, { secret: 'guess' })).status).toBe(403)
  })

  it('refuses an address that isn’t the tenant’s sign-in', async () => {
    expect((await post('', { authorizeUrl: 'https://evil.example/authorize?client_id=a&state=s&code_challenge=c' })).status).toBe(400)
  })

  it('takes one answer per code', async () => {
    const { code } = (await (await post('', { authorizeUrl: AUTHORIZE })).json()) as { code: string }
    expect((await post(`/${code}/complete`, { search: '?code=a&state=s1' })).status).toBe(204)
    expect((await post(`/${code}/complete`, { search: '?code=b&state=s1' })).status).toBe(409)
    expect((await post('/ZZZZZZ/complete', { search: '?code=a&state=s1' })).status).toBe(404)
  })
})
