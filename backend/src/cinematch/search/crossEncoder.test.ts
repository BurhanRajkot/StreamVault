import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { crossEncoderReRank } from './crossEncoder'
import { HybridSearchResult } from './hybridSearch'

describe('Cross Encoder Re-Rank', () => {
  const originalEnv = process.env.GEMINI_API_KEY
  
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test_key'
  })

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv
  })

  const createCandidate = (id: number, score: number): HybridSearchResult => ({
    id,
    media_type: 'movie',
    title: `Movie ${id}`,
    overview: 'Test overview',
    hybridScore: score,
    originalScores: {}
  } as unknown as HybridSearchResult)

  it('should return original candidates if array is empty', async () => {
    const fetchSpy = spyOn(global, 'fetch')
    
    const result = await crossEncoderReRank('query', [])
    
    expect(result.length).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    
    fetchSpy.mockRestore()
  })

  it('should rerank top K candidates using mock LLM scores', async () => {
    const candidates = [
      createCandidate(1, 0.9),
      createCandidate(2, 0.8),
      createCandidate(3, 0.7), // This one will get a big boost
      createCandidate(4, 0.6)
    ]

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scores: [
                    { id: 1, score: 0.2 },
                    { id: 2, score: 0.1 },
                    { id: 3, score: 0.9 }, // High score from LLM
                    { id: 4, score: 0.0 }
                  ]
                })
              }
            ]
          }
        }
      ]
    }
    
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() => 
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('some query', candidates, 10)
    
    expect(result.length).toBe(4)
    
    // Candidate 3 should be at the top now because 
    // new score = (0.9 * 0.6) + (0.7 * 0.4) = 0.54 + 0.28 = 0.82
    // Candidate 1 new score = (0.2 * 0.6) + (0.9 * 0.4) = 0.12 + 0.36 = 0.48
    expect(result[0].id).toBe(3)
    expect(result[0].hybridScore).toBeCloseTo(0.82)
    expect(result[1].id).toBe(1)
    
    fetchSpy.mockRestore()
  })

  it('should not rerank elements beyond topK', async () => {
    const candidates = [
      createCandidate(1, 0.9),
      createCandidate(2, 0.8),
      createCandidate(3, 0.7)
    ]

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scores: [
                    { id: 1, score: 0.5 }
                  ]
                })
              }
            ]
          }
        }
      ]
    }
    
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() => 
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    // Only rerank top 1
    const result = await crossEncoderReRank('query', candidates, 1)
    
    expect(result.length).toBe(3)
    // Candidate 2 and 3 should retain their original scores and positions
    expect(result[1].id).toBe(2)
    expect(result[2].id).toBe(3)
    
    fetchSpy.mockRestore()
  })
})
