import { afterEach, describe, it, expect, mock } from 'bun:test'
import { DebridRequestError, isNetworkFailure, searchDebridMedia } from './debridApi'

const originalFetch = globalThis.fetch

/** React 19 adds `preconnect` to the global fetch type: launder the mock through one cast. */
const stubFetch = (impl: () => Promise<Response>) => {
  const fn = mock(impl)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('isNetworkFailure', () => {
  it('is a request that never got through, not an answer', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new DebridRequestError('nope', 500))).toBe(false)
    expect(isNetworkFailure(new Error('boom'))).toBe(false)
  })
})

describe('a request on a weak connection', () => {
  it('is asked again when it doesn’t get through', async () => {
    let calls = 0
    const fetchMock = stubFetch(async () => {
      if (++calls === 1) throw new TypeError('Failed to fetch')
      return Response.json({ data: [{ name: 'Movie.2024.1080p' }] })
    })
    const releases = await searchDebridMedia('Movie', 'tt1', 'movie')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(releases).toHaveLength(1)
  })

  it('is not asked again when the backend answered no', async () => {
    const fetchMock = stubFetch(async () => Response.json({ error: 'Server error' }, { status: 500 }))
    await expect(searchDebridMedia('Movie', 'tt1', 'movie')).rejects.toBeInstanceOf(DebridRequestError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
