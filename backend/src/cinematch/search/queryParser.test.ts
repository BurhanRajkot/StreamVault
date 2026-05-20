import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { isComplexQuery, parseQueryNLU } from './queryParser'

describe('Query Parser', () => {
  describe('isComplexQuery', () => {
    it('should identify simple title searches as false', () => {
      expect(isComplexQuery('inception')).toBe(false)
      expect(isComplexQuery('the dark knight')).toBe(false)
    })

    it('should identify descriptive queries as true', () => {
      expect(isComplexQuery('scary 90s movies')).toBe(true)
      expect(isComplexQuery('funny shows about friends')).toBe(true)
      expect(isComplexQuery('movies directed by nolan')).toBe(true)
      // 4 or more words should also trigger true
      expect(isComplexQuery('a really really long title')).toBe(true)
    })
  })

  describe('parseQueryNLU', () => {
    const originalEnv = process.env.OPENAI_API_KEY
    
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test_key'
    })

    afterEach(() => {
      process.env.OPENAI_API_KEY = originalEnv
    })

    it('should return null for non-complex queries without calling LLM', async () => {
      const fetchSpy = spyOn(global, 'fetch')
      
      const result = await parseQueryNLU('inception')
      
      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
      
      fetchSpy.mockRestore()
    })

    it('should parse complex queries using mocked LLM response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                isConversational: true,
                remainingQuery: 'aliens',
                mediaType: 'movie',
                genres: [878, 28], // Sci-Fi, Action
                decade: 1990
              })
            }
          }
        ]
      }
      
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() => 
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('90s action sci-fi movies about aliens')
      
      expect(result).not.toBeNull()
      expect(result?.isConversational).toBe(true)
      expect(result?.mediaType).toBe('movie')
      expect(result?.remainingQuery).toBe('aliens')
      expect(result?.filters.with_genres).toBe('878,28')
      expect(result?.filters['primary_release_date.gte']).toBe('1990-01-01')
      expect(result?.filters['primary_release_date.lte']).toBe('1999-12-31')
      
      fetchSpy.mockRestore()
    })

    it('should return null if LLM says it is not conversational', async () => {
       const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                isConversational: false
              })
            }
          }
        ]
      }
      
      const fetchSpy = spyOn(global, 'fetch').mockImplementation((() => 
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      ) as any)

      const result = await parseQueryNLU('a really really long title')
      expect(result).toBeNull()
      
      fetchSpy.mockRestore()
    })
  })
})
