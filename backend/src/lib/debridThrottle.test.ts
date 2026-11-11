/**
 * Real-Debrid's "slow down" answers (rate limit, fair-usage throttle) are
 * waited out and retried rather than reported — against a stubbed API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { DebridError, getAccountStatus, setThrottleBackoffForTests } from './debrid'

const realFetch = globalThis.fetch
const savedKey = process.env.DEBRID_API_KEY

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const USER = { username: 'u', type: 'premium', expiration: '2030-01-01T00:00:00.000Z' }

/** Answers each call with the next response given, then the last one forever. */
function stubRealDebrid(...responses: Array<() => Response>): { calls: () => number } {
  let n = 0
  globalThis.fetch = (async () => responses[Math.min(n++, responses.length - 1)]()) as unknown as typeof fetch
  return { calls: () => n }
}

beforeEach(() => {
  process.env.DEBRID_API_KEY = 'test-key'
  setThrottleBackoffForTests([0, 0, 0])
})

afterEach(() => {
  globalThis.fetch = realFetch
  process.env.DEBRID_API_KEY = savedKey
  setThrottleBackoffForTests([1000, 2500, 4500])
})

describe('a throttled Real-Debrid call', () => {
  it('is retried until Real-Debrid lets it through (fair-usage throttle)', async () => {
    const api = stubRealDebrid(
      () => json({ error: 'fair_usage_limit', error_code: 36 }, 503),
      () => json({ error: 'fair_usage_limit', error_code: 36 }, 503),
      () => json(USER)
    )
    expect((await getAccountStatus()).premium).toBe(true)
    expect(api.calls()).toBe(3)
  })

  it('is retried after a plain 429, honouring Retry-After', async () => {
    const api = stubRealDebrid(() => json({ error: 'too_many_requests', error_code: 34 }, 429, { 'retry-after': '0' }), () => json(USER))
    expect((await getAccountStatus()).premium).toBe(true)
    expect(api.calls()).toBe(2)
  })

  it('gives up after three retries, with the error saying which call it was', async () => {
    const api = stubRealDebrid(() => json({ error: 'fair_usage_limit', error_code: 36 }, 503))
    const err = await getAccountStatus().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DebridError)
    expect((err as DebridError).code).toBe(36)
    expect((err as DebridError).message).toContain('on /user')
    expect(api.calls()).toBe(4)
  })

  it('isn’t confused with a real failure, which is never retried', async () => {
    const api = stubRealDebrid(() => json({ error: 'bad_token', error_code: 8 }, 401))
    const err = await getAccountStatus().catch((e: unknown) => e)
    expect((err as DebridError).code).toBe(8)
    expect(api.calls()).toBe(1)
  })
})
