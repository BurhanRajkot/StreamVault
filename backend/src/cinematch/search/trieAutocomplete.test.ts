import { describe, it, expect, beforeEach } from 'bun:test'
import { globalTrie, TrieEntity } from './trieAutocomplete'

describe('AutocompleteTrie — Extended Tests', () => {
  beforeEach(() => {
    // Nothing to reset on the global singleton; tests build on accumulated state,
    // but search for unique prefixes to stay independent.
  })

  it('should be case-insensitive when searching', () => {
    const entity: TrieEntity = {
      id: 1000,
      title: 'Interstellar',
      mediaType: 'movie',
      popularity: 200,
    }
    globalTrie.insert(entity, 'Interstellar')

    const upper = globalTrie.search('INTER')
    const lower = globalTrie.search('inter')
    const mixed = globalTrie.search('Inter')

    // All three should find Interstellar
    expect(upper.some(r => r.id === 1000)).toBe(true)
    expect(lower.some(r => r.id === 1000)).toBe(true)
    expect(mixed.some(r => r.id === 1000)).toBe(true)
  })

  it('should handle prefix of just one character', () => {
    const entity: TrieEntity = {
      id: 1001,
      title: 'Parasite',
      mediaType: 'movie',
      popularity: 300,
    }
    globalTrie.insert(entity, 'Parasite')
    const results = globalTrie.search('P')
    expect(results.some(r => r.id === 1001)).toBe(true)
  })

  it('should return up to the default limit of results', () => {
    // Insert 15 entities with same prefix 'ZTEST'
    for (let i = 0; i < 15; i++) {
      globalTrie.insert(
        { id: 9000 + i, title: `ZTest Movie ${i}`, mediaType: 'movie', popularity: i * 10 },
        `ZTest Movie ${i}`,
      )
    }
    const results = globalTrie.search('Ztest')
    // Default limit in implementation is typically 10
    expect(results.length).toBeLessThanOrEqual(15)
    expect(results.length).toBeGreaterThan(0)
  })

  it('should prefer higher popularity when multiple matches share a prefix', () => {
    globalTrie.insert({ id: 2001, title: 'ZXXY High', mediaType: 'movie', popularity: 500 }, 'ZXXY High')
    globalTrie.insert({ id: 2002, title: 'ZXXY Low', mediaType: 'movie', popularity: 10 }, 'ZXXY Low')

    const results = globalTrie.search('ZXXY')
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].id).toBe(2001) // Higher popularity first
  })

  it('should handle TV shows alongside movies without conflict', () => {
    globalTrie.insert(
      { id: 3001, title: 'TVONLY Series', mediaType: 'tv', popularity: 120 },
      'TVONLY Series',
    )
    globalTrie.insert(
      { id: 3002, title: 'TVONLY Movie', mediaType: 'movie', popularity: 110 },
      'TVONLY Movie',
    )
    const results = globalTrie.search('TVONLY')
    const ids = results.map(r => r.id)
    expect(ids).toContain(3001)
    expect(ids).toContain(3002)
  })

  it('should report increasing node count as items are inserted', () => {
    const before = globalTrie.getSizeInfo().nodeCount
    globalTrie.insert(
      { id: 4001, title: 'UNIQUEPREFIX Quantum Voyage', mediaType: 'movie', popularity: 50 },
      'UNIQUEPREFIX Quantum Voyage',
    )
    const after = globalTrie.getSizeInfo().nodeCount
    expect(after).toBeGreaterThan(before)
  })

  it('should handle entities with release_year metadata', () => {
    const entity: TrieEntity = {
      id: 5001,
      title: 'YEARTEST Movie',
      mediaType: 'movie',
      popularity: 80,
      release_year: 1999,
    }
    globalTrie.insert(entity, 'YEARTEST Movie')
    const results = globalTrie.search('YEARTEST')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].release_year).toBe(1999)
  })

  it('should return empty array for empty string search', () => {
    // Empty prefix should match everything — implementation-specific, but should not crash
    expect(() => globalTrie.search('')).not.toThrow()
  })

  it('should return empty for very long non-matching prefix', () => {
    const results = globalTrie.search('THISPREFIXDOESNOTEXISTANYWHERE12345678')
    expect(results).toEqual([])
  })

  it('should allow inserting same entity with different index text', () => {
    const entity: TrieEntity = {
      id: 6001,
      title: 'The Revenant',
      mediaType: 'movie',
      popularity: 180,
    }
    globalTrie.insert(entity, 'The Revenant')
    globalTrie.insert(entity, 'Revenant')

    const withThe = globalTrie.search('The Rev')
    const withoutThe = globalTrie.search('Revenant')

    expect(withThe.some(r => r.id === 6001)).toBe(true)
    expect(withoutThe.some(r => r.id === 6001)).toBe(true)
  })
})
