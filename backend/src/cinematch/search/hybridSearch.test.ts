import { describe, it, expect } from 'bun:test'
import { isSearchNoise, rankSearchResults, titleMatchScore } from './hybridSearch'

describe('titleMatchScore', () => {
  it('scores an exact title highest, ignoring case, punctuation and accents', () => {
    expect(titleMatchScore('Inception', 'inception')).toBe(1)
    expect(titleMatchScore('Spider-Man: No Way Home', 'spider man no way home')).toBe(1)
    expect(titleMatchScore('Amélie', 'amelie')).toBe(1)
  })

  it('matches what is still being typed', () => {
    expect(titleMatchScore('Narcos', 'nar')).toBe(0.85)
    expect(titleMatchScore('The Dark Knight', 'dark kn')).toBe(0.6)
    expect(titleMatchScore('Breaking Bad', 'bad')).toBe(0.6)
  })

  it('gives nothing to a title that does not contain the query', () => {
    expect(titleMatchScore('Interstellar', 'nar')).toBe(0)
    expect(titleMatchScore('', 'nar')).toBe(0)
  })
})

describe('isSearchNoise', () => {
  it('flags hits with no poster that almost nobody has rated', () => {
    expect(isSearchNoise({ poster_path: null, vote_count: 0 })).toBe(true)
    expect(isSearchNoise({ poster_path: undefined })).toBe(true)
  })

  it('keeps anything with artwork, or a real audience', () => {
    expect(isSearchNoise({ poster_path: '/a.jpg', vote_count: 0 })).toBe(false)
    expect(isSearchNoise({ poster_path: null, vote_count: 500 })).toBe(false)
  })
})

describe('rankSearchResults', () => {
  const hit = (id: number, name: string, popularity: number, vote_count: number, media_type: 'movie' | 'tv' = 'tv') => ({
    id,
    media_type,
    ...(media_type === 'tv' ? { name } : { title: name }),
    popularity,
    vote_count,
    poster_path: `/${id}.jpg`,
  })

  it('puts the shows people mean ahead of an obscure title that is literally the word typed so far', () => {
    const ranked = rankSearchResults('nar', [
      hit(1, 'Nar', 0.6, 3, 'movie'),
      hit(2, 'Narcos', 80, 4000),
      hit(3, 'Naruto', 120, 6000),
      hit(4, 'Snarky Puppy Live', 2, 10, 'movie'),
    ])
    const names = ranked.map((r) => r.title ?? r.name)
    expect(names.slice(0, 2).sort()).toEqual(['Narcos', 'Naruto'])
    expect(names.indexOf('Nar')).toBeGreaterThan(1)
  })

  it('puts the exact title first for a full query', () => {
    const ranked = rankSearchResults('inception', [
      { ...hit(1, 'The Inception of Things', 1, 5, 'movie'), overview: 'An inception story' },
      { ...hit(2, 'Inception', 90, 36000, 'movie'), overview: 'A thief who steals secrets through dreams.' },
      { ...hit(3, 'Inception: The Cobol Job', 5, 400, 'movie'), overview: 'A prequel to Inception.' },
    ])
    expect(ranked[0].title).toBe('Inception')
  })

  it('returns every hit once, with its scores attached', () => {
    const ranked = rankSearchResults('dark', [hit(1, 'Dark', 50, 3000), hit(2, 'The Dark Knight', 90, 30000, 'movie')])
    expect(ranked).toHaveLength(2)
    for (const r of ranked) {
      expect(r.hybridScore).toBeGreaterThan(0)
      expect(Number.isFinite(r.bm25Score)).toBe(true)
    }
  })
})
