import { describe, it, expect } from 'bun:test'
import { tokenize, rankWithBM25, BM25Document } from './bm25'

describe('BM25 Search', () => {
  describe('tokenize', () => {
    it('should tokenize text, lowercase, remove punctuation and filter stopwords', () => {
      const text = 'The Quick! Brown Fox, Jumps Over The Lazy Dog.'
      const tokens = tokenize(text)
      
      expect(tokens).toContain('quick')
      expect(tokens).toContain('brown')
      expect(tokens).toContain('fox')
      expect(tokens).toContain('jumps')
      expect(tokens).toContain('over')
      expect(tokens).toContain('lazy')
      expect(tokens).toContain('dog')
      
      // Stopwords and short words
      expect(tokens).not.toContain('the')
      expect(tokens).not.toContain('a')
    })
  })

  describe('rankWithBM25', () => {
    const docs: BM25Document[] = [
      {
        id: 1,
        fields: {
          title: 'The Matrix',
          overview: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.'
        }
      },
      {
        id: 2,
        fields: {
          title: 'The Matrix Reloaded',
          overview: 'Neo and the rebel leaders estimate that they have 72 hours until 250,000 probes discover Zion and destroy it and its inhabitants.'
        }
      },
      {
        id: 3,
        fields: {
          title: 'Inception',
          overview: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.'
        }
      }
    ]

    it('should rank documents containing query terms higher', () => {
      const results = rankWithBM25('matrix', docs, ['title', 'overview'])
      
      expect(results.length).toBe(3)
      // Matrix docs should be at the top
      expect(results[0].doc.id === 1 || results[0].doc.id === 2).toBe(true)
      expect(results[1].doc.id === 1 || results[1].doc.id === 2).toBe(true)
      
      // Inception should have a score of 0 and be at the bottom
      expect(results[2].doc.id).toBe(3)
      expect(results[2].bm25Score).toBe(0)
      
      // The exact title match might rank higher depending on BM25 tuning, 
      // but both should have scores > 0
      expect(results[0].bm25Score).toBeGreaterThan(0)
    })

    it('should handle empty queries gracefully', () => {
      const results = rankWithBM25('', docs, ['title', 'overview'])
      expect(results.length).toBe(3)
      expect(results[0].bm25Score).toBe(0)
    })

    it('should handle queries with only stopwords gracefully', () => {
      const results = rankWithBM25('the and or', docs, ['title', 'overview'])
      expect(results.length).toBe(3)
      expect(results[0].bm25Score).toBe(0)
    })
  })
})
