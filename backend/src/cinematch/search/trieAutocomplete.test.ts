import { describe, it, expect, beforeEach } from 'bun:test'
import { globalTrie, seedTrieBackground, TrieEntity } from './trieAutocomplete'

describe('AutocompleteTrie', () => {
  beforeEach(() => {
    // Reset trie logic if needed or just use the global one carefully
    // Since it's a singleton, we'll just test its insertion and search
  })

  it('should insert and search basic titles', () => {
    const entity: TrieEntity = {
      id: 1,
      title: 'Inception',
      mediaType: 'movie',
      popularity: 100,
      release_year: 2010
    }
    
    globalTrie.insert(entity, 'Inception')
    
    const results = globalTrie.search('Ince')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('Inception')
    expect(results[0].id).toBe(1)
  })

  it('should return empty for unmatched prefixes', () => {
    const results = globalTrie.search('xyznonexistent')
    expect(results.length).toBe(0)
  })

  it('should insert with custom indexing text', () => {
    const entity: TrieEntity = {
      id: 2,
      title: 'The Dark Knight',
      mediaType: 'movie',
      popularity: 150
    }
    
    // Insert with "Dark Knight" to allow searching without "The"
    globalTrie.insert(entity, 'Dark Knight')
    
    const results = globalTrie.search('Dark K')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('The Dark Knight')
  })

  it('should sort top entities by popularity', () => {
    const entity1: TrieEntity = { id: 3, title: 'Matrix', mediaType: 'movie', popularity: 50 }
    const entity2: TrieEntity = { id: 4, title: 'Matrix Reloaded', mediaType: 'movie', popularity: 80 }
    
    globalTrie.insert(entity1, 'Matrix')
    globalTrie.insert(entity2, 'Matrix Reloaded')
    
    const results = globalTrie.search('Matri')
    expect(results.length).toBeGreaterThanOrEqual(2)
    // The higher popularity one should be first
    expect(results[0].title).toBe('Matrix Reloaded')
  })

  it('should provide size info', () => {
    const stats = globalTrie.getSizeInfo()
    expect(stats.nodeCount).toBeGreaterThan(0)
    expect(stats.entityRefs).toBeGreaterThan(0)
  })
})
