import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { isComplexQuery, parseQueryNLU } from './queryParser'

describe('Query Parser — Extended Tests', () => {
  describe('isComplexQuery', () => {
    it('should return false for simple one-word searches', () => {
      expect(isComplexQuery('inception')).toBe(false)
      expect(isComplexQuery('batman')).toBe(false)
    })

    it('should return false for two-word titles without descriptive terms', () => {
      expect(isComplexQuery('dark knight')).toBe(false)
      expect(isComplexQuery('iron man')).toBe(false)
    })

    it('should return false for three-word titles without descriptive terms', () => {
      expect(isComplexQuery('the dark knight')).toBe(false)
    })

    it('should return true when query contains 4+ words', () => {
      expect(isComplexQuery('a really long query')).toBe(true)
      expect(isComplexQuery('one two three four')).toBe(true)
    })

    it('should return true for queries with descriptive keyword "movies"', () => {
      expect(isComplexQuery('scary movies')).toBe(true)
    })

    it('should return true for queries with descriptive keyword "shows"', () => {
      expect(isComplexQuery('crime shows')).toBe(true)
    })

    it('should return true for queries with keyword "about"', () => {
      expect(isComplexQuery('movies about time travel')).toBe(true)
    })

    it('should return true for queries with keyword "like"', () => {
      expect(isComplexQuery('show like narcos')).toBe(true)
    })

    it('should return true for queries with keyword "directed"', () => {
      expect(isComplexQuery('directed by nolan')).toBe(true)
    })

    it('should return true for queries with "funny" or "scary"', () => {
      expect(isComplexQuery('funny shows')).toBe(true)
      expect(isComplexQuery('scary stuff')).toBe(true)
    })

    it('should be case-insensitive for descriptive keywords', () => {
      expect(isComplexQuery('MOVIES by spielberg')).toBe(true)
      expect(isComplexQuery('Funny things')).toBe(true)
    })
  })

  describe('parseQueryNLU — extended', () => {
    const originalKey = process.env.GEMINI_API_KEY
    beforeEach(() => { process.env.GEMINI_API_KEY = 'test_key' })
    afterEach(() => { process.env.GEMINI_API_KEY = originalKey })

    const geminiReply = (data: object) => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }]
    })

    it('should return null when GEMINI_API_KEY is missing', async () => {
      process.env.GEMINI_API_KEY = ''
      const result = await parseQueryNLU('scary 90s movies')
      expect(result).toBeNull()
    })

    it('should return null when API returns non-OK status', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response('', { status: 503 }))
      ) as any)
      const result = await parseQueryNLU('action movies from 80s')
      expect(result).toBeNull()
      fetchSpy.mockRestore()
    })

    it('should return null when fetch throws', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.reject(new Error('Network down'))
      ) as any)
      const result = await parseQueryNLU('comedy shows about family')
      expect(result).toBeNull()
      fetchSpy.mockRestore()
    })

    it('should build TV date filters when mediaType is "tv"', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response(JSON.stringify(geminiReply({
          isConversational: true,
          remainingQuery: '',
          mediaType: 'tv',
          genres: [18],
          decade: 2000,
        })), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('drama tv shows from 2000s')
      expect(result?.filters['first_air_date.gte']).toBe('2000-01-01')
      expect(result?.filters['first_air_date.lte']).toBe('2009-12-31')
      expect(result?.filters['primary_release_date.gte']).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('should omit date filters when no decade is given', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response(JSON.stringify(geminiReply({
          isConversational: true,
          remainingQuery: 'robots',
          mediaType: 'movie',
          genres: [878],
        })), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('sci-fi movies about robots')
      expect(result).not.toBeNull()
      expect(result?.filters.with_genres).toBe('878')
      expect(result?.filters['primary_release_date.gte']).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('should return null when LLM says not conversational and no structured filters', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response(JSON.stringify(geminiReply({
          isConversational: false,
          genres: [],
        })), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('blade runner 2049')
      expect(result).toBeNull()
      fetchSpy.mockRestore()
    })

    it('should keep result when isConversational is false but genres are present', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response(JSON.stringify(geminiReply({
          isConversational: false,
          genres: [28, 12],
        })), { status: 200 }))
      ) as any)

      // Use 4 words to bypass the simple-query guard in isComplexQuery
      const result = await parseQueryNLU('action adventure thriller quick')
      // hasStructuredFilters = true (genres present), so should return a result
      expect(result).not.toBeNull()
      expect(result?.filters.with_genres).toBe('28,12')
      fetchSpy.mockRestore()
    })

    it('should handle multiple genres in comma-separated format', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
        Promise.resolve(new Response(JSON.stringify(geminiReply({
          isConversational: true,
          genres: [28, 12, 878, 53],
          decade: 1990,
        })), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('90s action adventure sci-fi thriller movies')
      expect(result?.filters.with_genres).toBe('28,12,878,53')
      fetchSpy.mockRestore()
    })
  })
})
