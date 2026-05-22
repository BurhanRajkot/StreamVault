import { describe, it, expect } from 'bun:test'
import {
  tokenize,
  rankWithBM25,
  buildCorpusStats,
  scoreBM25,
  FIELD_CONFIGS,
  BM25Document,
} from './bm25'

describe('BM25 Advanced Tests', () => {
  describe('tokenize — edge cases', () => {
    it('should return empty array for empty string', () => {
      expect(tokenize('')).toEqual([])
    })

    it('should return empty array for whitespace-only input', () => {
      expect(tokenize('   ')).toEqual([])
    })

    it('should filter single-character tokens', () => {
      const tokens = tokenize('a b c x y z')
      expect(tokens).not.toContain('a')
      expect(tokens).not.toContain('b')
    })

    it('should preserve multi-character non-stopword tokens', () => {
      const tokens = tokenize('inception nolan dark')
      expect(tokens).toContain('inception')
      expect(tokens).toContain('nolan')
      expect(tokens).toContain('dark')
    })

    it('should strip punctuation including apostrophes and colons', () => {
      const tokens = tokenize("don't, stop: here!")
      expect(tokens).toContain('don')
      expect(tokens).toContain('stop')
      expect(tokens).toContain('here')
    })

    it('should handle numeric tokens', () => {
      const tokens = tokenize('movie 2049 blade runner')
      expect(tokens).toContain('2049')
      expect(tokens).toContain('blade')
      expect(tokens).toContain('runner')
    })

    it('should not include stopwords even in mixed text', () => {
      const stopwords = ['the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
      const text = stopwords.join(' ') + ' inception'
      const tokens = tokenize(text)
      for (const sw of stopwords) {
        expect(tokens).not.toContain(sw)
      }
      expect(tokens).toContain('inception')
    })
  })

  describe('buildCorpusStats', () => {
    it('should compute correct document frequency for shared terms', () => {
      const docs = [
        ['matrix', 'hacker'],
        ['matrix', 'rebel'],
        ['inception', 'dream'],
      ]
      const fieldDocs = [
        { title: ['matrix', 'hacker'] },
        { title: ['matrix', 'rebel'] },
        { title: ['inception', 'dream'] },
      ]
      const stats = buildCorpusStats(docs, fieldDocs)
      expect(stats.docFreqMap.get('matrix')?.size).toBe(2)
      expect(stats.docFreqMap.get('inception')?.size).toBe(1)
      expect(stats.totalDocs).toBe(3)
    })

    it('should not double-count terms appearing multiple times in the same doc', () => {
      const docs = [['matrix', 'matrix', 'matrix']]
      const fieldDocs = [{ title: ['matrix', 'matrix', 'matrix'] }]
      const stats = buildCorpusStats(docs, fieldDocs)
      expect(stats.docFreqMap.get('matrix')?.size).toBe(1)
    })

    it('should compute average field length correctly', () => {
      const docs = [
        ['word1', 'word2'],
        ['word3'],
        ['word4', 'word5', 'word6'],
      ]
      const fieldDocs = [
        { title: ['word1', 'word2'] },
        { title: ['word3'] },
        { title: ['word4', 'word5', 'word6'] },
      ]
      const stats = buildCorpusStats(docs, fieldDocs)
      expect(stats.avgFieldLength['title']).toBeCloseTo(2.0)
    })
  })

  describe('scoreBM25', () => {
    it('should return 0 for a query term not in any field', () => {
      const docs = [['matrix', 'hacker']]
      const fieldDocs = [{ title: ['matrix', 'hacker'] }]
      const stats = buildCorpusStats(docs, fieldDocs)
      const score = scoreBM25(['nonexistent'], { title: ['matrix', 'hacker'] }, stats)
      expect(score).toBe(0)
    })

    it('should apply title field weight higher than overview', () => {
      const docs = [['term']]
      const fieldDocs = [{ title: ['term'], overview: ['term'] }]
      const stats = buildCorpusStats(docs, fieldDocs)
      const titleScore = scoreBM25(['term'], { title: ['term'] }, stats)
      const overviewScore = scoreBM25(['term'], { overview: ['term'] }, stats)
      expect(titleScore).toBeGreaterThan(overviewScore)
    })

    it('should skip unknown field configs gracefully', () => {
      const docs = [['term']]
      const fieldDocs = [{ unknownField: ['term'] }]
      const stats = buildCorpusStats(docs, fieldDocs)
      expect(() => scoreBM25(['term'], { unknownField: ['term'] }, stats)).not.toThrow()
      const score = scoreBM25(['term'], { unknownField: ['term'] }, stats)
      expect(score).toBe(0)
    })
  })

  describe('rankWithBM25 — advanced ranking', () => {
    const docs: BM25Document[] = [
      { id: 1, fields: { title: 'The Matrix', overview: 'A computer hacker learns the truth about reality.' } },
      { id: 2, fields: { title: 'The Matrix Reloaded', overview: 'Neo and rebels fight machine controllers.' } },
      { id: 3, fields: { title: 'Inception', overview: 'A thief plants ideas into the mind of a CEO.' } },
      { id: 4, fields: { title: 'Blade Runner', overview: 'A detective hunts down rogue androids in the future.' } },
      { id: 5, fields: { title: 'Blade Runner 2049', overview: 'A new blade runner uncovers a long-buried secret.' } },
    ]

    it('should rank exact title match higher than overview-only match', () => {
      const results = rankWithBM25('blade runner', docs)
      expect(results[0].doc.id === 4 || results[0].doc.id === 5).toBe(true)
      expect(results[4].bm25Score).toBe(0)
    })

    it('should score multi-word queries combining term scores', () => {
      const results = rankWithBM25('matrix hacker', docs)
      expect(results[0].doc.id).toBe(1)
    })

    it('should handle single-document corpus', () => {
      const singleDoc: BM25Document[] = [
        { id: 1, fields: { title: 'Inception', overview: 'Dreams within dreams.' } },
      ]
      const results = rankWithBM25('inception', singleDoc)
      expect(results.length).toBe(1)
      expect(results[0].bm25Score).toBeGreaterThan(0)
    })

    it('should return all documents for zero-score queries', () => {
      const results = rankWithBM25('unicorn', docs)
      expect(results.length).toBe(docs.length)
      expect(results.every(r => r.bm25Score === 0)).toBe(true)
    })

    it('should restrict scoring to specified activeFields', () => {
      const titleOnlyResults = rankWithBM25('hacker', docs, ['title'])
      expect(titleOnlyResults.every(r => r.bm25Score === 0)).toBe(true)

      const fullResults = rankWithBM25('hacker', docs, ['title', 'overview'])
      expect(fullResults[0].bm25Score).toBeGreaterThan(0)
      expect(fullResults[0].doc.id).toBe(1)
    })

    it('should not produce NaN scores', () => {
      const results = rankWithBM25('xyz notaword', docs)
      for (const r of results) {
        expect(isNaN(r.bm25Score)).toBe(false)
      }
    })
  })

  describe('FIELD_CONFIGS constants', () => {
    it('should define title with highest weight', () => {
      expect(FIELD_CONFIGS.title.weight).toBeGreaterThan(FIELD_CONFIGS.overview.weight)
    })

    it('should define low b for title (short docs, less length normalisation)', () => {
      expect(FIELD_CONFIGS.title.b).toBeLessThan(0.5)
    })

    it('should define high b for overview (long docs, more length normalisation)', () => {
      expect(FIELD_CONFIGS.overview.b).toBeGreaterThan(0.5)
    })
  })
})
