import { afterEach, describe, expect, it, mock } from 'bun:test'
import { bearerToken, fetchAuth0Profile } from './accountProfile'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('bearerToken', () => {
  it('reads the token from an Authorization header', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer  xyz ')).toBe('xyz')
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken('Basic abc')).toBeNull()
  })
})

describe('fetchAuth0Profile', () => {
  it("asks Auth0's /userinfo with the account's own token", async () => {
    process.env.AUTH0_DOMAIN = 'example.auth0.com'
    const fetchMock = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://example.auth0.com/userinfo')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      return new Response(JSON.stringify({ sub: 'google-oauth2|1', email: 'Someone@Gmail.com', name: 'Some One' }))
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    expect(await fetchAuth0Profile('tok')).toEqual({ email: 'someone@gmail.com', name: 'Some One' })
  })

  it('gives no email when Auth0 has none, and fails on a refusal', async () => {
    process.env.AUTH0_DOMAIN = 'https://example.auth0.com/'
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ nickname: 'nick' }))) as unknown as typeof fetch
    expect(await fetchAuth0Profile('tok')).toEqual({ email: null, name: 'nick' })
    globalThis.fetch = mock(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch
    await expect(fetchAuth0Profile('tok')).rejects.toThrow('401')
  })
})
