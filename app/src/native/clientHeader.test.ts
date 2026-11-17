import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

mock.module('./platform', () => ({ APP_VERSION: '9.9.9' }))
const { CLIENT_HEADER, markAppRequests } = await import('./clientHeader')

const API = 'https://api.example.test'

describe('markAppRequests', () => {
  const realWindow = globalThis.window
  let sent: Headers[]

  beforeEach(() => {
    sent = []
    const fakeFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers))
      return Promise.resolve(new Response('{}'))
    }
    globalThis.window = { fetch: fakeFetch } as unknown as Window & typeof globalThis
    markAppRequests(API)
  })

  afterEach(() => {
    globalThis.window = realWindow
  })

  test('marks a signed-in call to the backend', async () => {
    await window.fetch(`${API}/me/access`, { headers: { Authorization: 'Bearer t' } })
    expect(sent[0].get(CLIENT_HEADER)).toBe('app/9.9.9')
    expect(sent[0].get('Authorization')).toBe('Bearer t')
  })

  // A custom header makes the browser send a CORS preflight first — a second round trip per search or title
  test('leaves anonymous backend calls alone, so they need no preflight', async () => {
    await window.fetch(`${API}/tmdb/search/hybrid?query=x`)
    await window.fetch(`${API}/tmdb/movie/1`, { headers: { Accept: 'application/json' } })
    expect(sent.map((h) => h.get(CLIENT_HEADER))).toEqual([null, null])
  })

  test('never marks calls to other hosts', async () => {
    await window.fetch('https://elsewhere.test/x', { headers: { Authorization: 'Bearer t' } })
    expect(sent[0].get(CLIENT_HEADER)).toBeNull()
  })
})
