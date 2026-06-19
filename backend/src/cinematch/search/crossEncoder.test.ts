import { describe, it, expect } from 'bun:test'
import { crossEncoderReRank } from './crossEncoder'
import { HybridSearchResult } from './hybridSearch'

describe('Cross Encoder Re-Rank — Pass-Through', () => {
  const makeCandidate = (id: number, score: number): HybridSearchResult => ({
    id,
    media_type: 'movie',
    title: `Movie ${id}`,
    overview: `Overview for movie ${id}`,
    hybridScore: score,
    bm25Score: score,
  } as unknown as HybridSearchResult)

  it('returns the candidates unchanged', async () => {
    const candidates = [makeCandidate(1, 0.9), makeCandidate(2, 0.8)]
    const result = await crossEncoderReRank('action movies', candidates)
    expect(result).toEqual(candidates)
  })

  it('returns empty array for empty input', async () => {
    const result = await crossEncoderReRank('query', [])
    expect(result).toEqual([])
  })

  it('returns single candidate unchanged', async () => {
    const candidates = [makeCandidate(42, 0.75)]
    const result = await crossEncoderReRank('inception', candidates, 5)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(42)
  })

  it('preserves original candidate order', async () => {
    const candidates = [
      makeCandidate(3, 0.7),
      makeCandidate(1, 0.9),
      makeCandidate(2, 0.8),
    ]
    const result = await crossEncoderReRank('query', candidates, 10)
    expect(result[0].id).toBe(3)
    expect(result[1].id).toBe(1)
    expect(result[2].id).toBe(2)
  })

  it('works with TV show candidates', async () => {
    const tvCandidate = {
      id: 99,
      media_type: 'tv',
      name: 'Breaking Bad',
      overview: 'A chemistry teacher turns drug lord.',
      hybridScore: 0.95,
      bm25Score: 0.95,
    } as unknown as HybridSearchResult

    const result = await crossEncoderReRank('chemistry drug', [tvCandidate])
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(99)
  })
})
