import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { crossEncoderReRank } from './crossEncoder'
import { HybridSearchResult } from './hybridSearch'

describe('Cross Encoder Re-Rank — Extended Tests', () => {
  const originalKey = process.env.GEMINI_API_KEY

  beforeEach(() => { process.env.GEMINI_API_KEY = 'test_key' })
  afterEach(() => { process.env.GEMINI_API_KEY = originalKey })

  const makeCandidate = (id: number, score: number, extra?: Partial<HybridSearchResult>): HybridSearchResult => ({
    id,
    media_type: 'movie',
    title: `Movie ${id}`,
    overview: `Overview for movie ${id}`,
    hybridScore: score,
    originalScores: {},
    ...extra,
  } as unknown as HybridSearchResult)

  it('returns candidates unchanged when GEMINI_API_KEY is missing', async () => {
    process.env.GEMINI_API_KEY = ''
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const result = await crossEncoderReRank('query', candidates)
    expect(result).toEqual(candidates)
  })

  it('falls back gracefully when API returns non-OK status', async () => {
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response('', { status: 500 }))
    ) as any)

    const result = await crossEncoderReRank('query', candidates)
    expect(result).toEqual(candidates)
    fetchSpy.mockRestore()
  })

  it('falls back gracefully when fetch throws a network error', async () => {
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.reject(new Error('Network failure'))
    ) as any)

    const result = await crossEncoderReRank('query', candidates)
    expect(result).toEqual(candidates)
    fetchSpy.mockRestore()
  })

  it('falls back when LLM returns malformed JSON scores', async () => {
    const candidates = [makeCandidate(1, 0.9)]
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: '{ "scores": "not-an-array" }' }] } }]
    }
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('query', candidates)
    // Should return the original candidate order without crashing
    expect(result.length).toBe(1)
    fetchSpy.mockRestore()
  })

  it('handles missing score IDs by treating them as 0', async () => {
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        scores: [{ id: 1, score: 0.5 }] // id 2 is missing
      }) }] } }]
    }
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('query', candidates, 10)
    // Candidate 1: (0.5*0.6)+(0.9*0.4) = 0.30+0.36 = 0.66
    // Candidate 2: (0.0*0.6)+(0.8*0.4) = 0.00+0.32 = 0.32
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
    fetchSpy.mockRestore()
  })

  it('attaches crossEncoderScore to reranked candidates', async () => {
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        scores: [{ id: 1, score: 0.7 }, { id: 2, score: 0.3 }]
      }) }] } }]
    }
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('query', candidates, 10)
    expect((result[0] as any).crossEncoderScore).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('preserves original order of remainder slice beyond topK', async () => {
    const candidates = [
      makeCandidate(1, 0.9),
      makeCandidate(2, 0.8),
      makeCandidate(3, 0.7),
      makeCandidate(4, 0.6), // beyond topK=2
      makeCandidate(5, 0.5), // beyond topK=2
    ]
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        scores: [{ id: 1, score: 0.2 }, { id: 2, score: 0.9 }]
      }) }] } }]
    }
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('query', candidates, 2)
    expect(result.length).toBe(5)
    // Remainder should be in original order
    expect(result[2].id).toBe(3)
    expect(result[3].id).toBe(4)
    expect(result[4].id).toBe(5)
    fetchSpy.mockRestore()
  })

  it('handles TV show candidates (name field instead of title)', async () => {
    const tvCandidate = {
      id: 99,
      media_type: 'tv',
      name: 'Breaking Bad',
      overview: 'A chemistry teacher turns drug lord.',
      hybridScore: 0.95,
      originalScores: {},
    } as unknown as HybridSearchResult

    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        scores: [{ id: 99, score: 0.98 }]
      }) }] } }]
    }
    const fetchSpy = spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    ) as any)

    const result = await crossEncoderReRank('chemistry teacher drug', [tvCandidate], 10)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(99)
    fetchSpy.mockRestore()
  })
})
