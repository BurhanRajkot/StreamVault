import { beforeAll, describe, expect, it } from 'bun:test'

process.env.ADMIN_TOTP_SECRET ||= 'test-totp-secret'
process.env.ADMIN_JWT_SECRET ||= 'test-jwt-secret'
process.env.SUPABASE_URL ||= 'http://supabase.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key'

let mod: typeof import('./accessRequests')

beforeAll(async () => {
  mod = await import('./accessRequests')
})

describe('parseRequestInput', () => {
  it('takes everything as optional', () => {
    expect(mod.parseRequestInput({})).toEqual({ github: null, note: null, email: null })
  })

  it('accepts a username typed as @name or a profile link', () => {
    expect(mod.parseRequestInput({ github: '@octo-cat' })).toMatchObject({ github: 'octo-cat' })
    expect(mod.parseRequestInput({ github: 'https://github.com/OctoCat/' })).toMatchObject({ github: 'OctoCat' })
  })

  it('refuses what cannot be a GitHub username', () => {
    expect(typeof mod.parseRequestInput({ github: 'bad name!' })).toBe('string')
    expect(typeof mod.parseRequestInput({ github: '-leading' })).toBe('string')
  })

  it('ignores a payment reference an older app still sends', () => {
    expect(mod.parseRequestInput({ reference: '412345678901' })).toEqual({ github: null, note: null, email: null })
  })

  it('drops an invalid email and caps the note', () => {
    const input = mod.parseRequestInput({ email: 'nope', note: 'x'.repeat(500) })
    expect(input).toMatchObject({ email: null })
    expect(typeof input !== 'string' && input.note?.length).toBe(300)
  })
})

describe('toRequest / sortRequests', () => {
  const base = { userId: 'auth0|a', createdAt: '2026-11-17T10:00:00.000Z' }

  it('drops malformed rows', () => {
    expect(mod.toRequest(null)).toBeNull()
    expect(mod.toRequest({ userId: 'not an id', createdAt: 'x' })).toBeNull()
    expect(mod.toRequest({ ...base, status: 'weird', starred: 'yes' })).toMatchObject({ status: 'pending', starred: null })
  })

  it('lists pending requests first, newest first', () => {
    const r = (userId: string, createdAt: string, status: 'pending' | 'approved') => mod.toRequest({ userId, createdAt, status })!
    const sorted = mod.sortRequests([
      r('auth0|old', '2026-11-01T00:00:00Z', 'pending'),
      r('auth0|done', '2026-11-20T00:00:00Z', 'approved'),
      r('auth0|new', '2026-11-10T00:00:00Z', 'pending'),
    ])
    expect(sorted.map((x) => x.userId)).toEqual(['auth0|new', 'auth0|old', 'auth0|done'])
  })
})
