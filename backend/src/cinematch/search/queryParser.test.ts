import { describe, it, expect } from 'bun:test'
import { isComplexQuery, parseQueryNLU } from './queryParser'

describe('Query Parser — Local Rule-Based NLU', () => {
  // ── isComplexQuery ──────────────────────────────────────────────────────
  describe('isComplexQuery', () => {
    it('returns false for simple one-word searches', () => {
      expect(isComplexQuery('inception')).toBe(false)
      expect(isComplexQuery('batman')).toBe(false)
    })

    it('returns false for two-word titles without descriptive terms', () => {
      expect(isComplexQuery('dark knight')).toBe(false)
      expect(isComplexQuery('iron man')).toBe(false)
    })

    it('returns false for three-word titles without descriptive terms', () => {
      expect(isComplexQuery('the dark knight')).toBe(false)
    })

    it('returns true when query has 4+ words', () => {
      expect(isComplexQuery('a really long query')).toBe(true)
      expect(isComplexQuery('one two three four')).toBe(true)
    })

    it('returns true for queries with genre keywords', () => {
      expect(isComplexQuery('scary movies')).toBe(true)    // scary → horror
      expect(isComplexQuery('action films')).toBe(true)   // action → genre
    })

    it('returns true for queries with media type words', () => {
      expect(isComplexQuery('crime shows')).toBe(true)
      expect(isComplexQuery('sci-fi series')).toBe(true)
    })

    it('returns true for queries with a year/decade', () => {
      expect(isComplexQuery('2000 action')).toBe(true)
      expect(isComplexQuery('90s horror')).toBe(true)
    })

    it('returns true for quality-hint queries', () => {
      expect(isComplexQuery('top rated')).toBe(true)
      expect(isComplexQuery('best films')).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(isComplexQuery('HORROR movies')).toBe(true)
      expect(isComplexQuery('Funny things')).toBe(true)
    })
  })

  // ── parseQueryNLU ───────────────────────────────────────────────────────
  describe('parseQueryNLU', () => {
    it('returns null for a simple title-like query', () => {
      expect(parseQueryNLU('inception')).toBeNull()
      expect(parseQueryNLU('blade runner')).toBeNull()
      expect(parseQueryNLU('dark knight')).toBeNull()
    })

    it('detects decade from "90s" pattern', () => {
      const r = parseQueryNLU('90s horror')
      expect(r).not.toBeNull()
      expect(r?.isConversational).toBe(true)
      expect(r?.filters['primary_release_date.gte']).toBe('1990-01-01')
      expect(r?.filters['primary_release_date.lte']).toBe('1999-12-31')
    })

    it('detects decade from "nineties" word', () => {
      const r = parseQueryNLU('nineties comedy movies')
      expect(r?.filters['primary_release_date.gte']).toBe('1990-01-01')
    })

    it('detects decade from 4-digit year "2000"', () => {
      const r = parseQueryNLU('2000 action movie')
      expect(r?.filters['primary_release_date.gte']).toBe('2000-01-01')
      expect(r?.filters['primary_release_date.lte']).toBe('2009-12-31')
    })

    it('detects action genre', () => {
      const r = parseQueryNLU('best action movies')
      expect(r?.filters.with_genres).toContain('28')
    })

    it('detects horror genre from "scary"', () => {
      const r = parseQueryNLU('scary horror 90s')
      expect(r?.filters.with_genres).toContain('27')
    })

    it('detects sci-fi genre', () => {
      const r = parseQueryNLU('sci-fi shows 2000s')
      expect(r?.filters.with_genres).toContain('878')
    })

    it('detects TV media type from "shows"', () => {
      const r = parseQueryNLU('crime shows nineties')
      expect(r?.mediaType).toBe('tv')
    })

    it('detects movie media type from "movies"', () => {
      const r = parseQueryNLU('comedy movies 2000')
      expect(r?.mediaType).toBe('movie')
    })

    it('detects TV media type from "anime"', () => {
      const r = parseQueryNLU('anime shows 2010')
      expect(r?.mediaType).toBe('tv')
    })

    it('uses TV date filters when media type is tv', () => {
      const r = parseQueryNLU('drama tv shows from 2000s')
      expect(r?.filters['first_air_date.gte']).toBe('2000-01-01')
      expect(r?.filters['first_air_date.lte']).toBe('2009-12-31')
    })

    it('applies top-rated sort for "best" queries', () => {
      const r = parseQueryNLU('best action films')
      expect(r?.filters.sort_by).toBe('vote_average.desc')
      expect(r?.filters['vote_average.gte']).toBe('7')
    })

    it('applies recent sort for "latest" queries', () => {
      const r = parseQueryNLU('latest horror movies')
      expect(r?.filters.sort_by).toBe('primary_release_date.desc')
    })

    it('extracts remaining title query for non-structural text', () => {
      const r = parseQueryNLU('movies about space robots 2010')
      // "space robots" should survive stripping
      expect(r?.remainingQuery).toBeDefined()
    })

    it('does not include remainder when only structural words remain', () => {
      const r = parseQueryNLU('action movies 2000')
      // after stripping "action", "movies", "2000" nothing meaningful should be left
      expect(r?.remainingQuery).toBeUndefined()
    })

    it('handles multiple genres (up to 2)', () => {
      const r = parseQueryNLU('action comedy movies 1990s')
      const genres = r?.filters.with_genres?.split(',') || []
      expect(genres.length).toBeLessThanOrEqual(2)
      expect(genres).toContain('28')  // action
    })
  })
})
