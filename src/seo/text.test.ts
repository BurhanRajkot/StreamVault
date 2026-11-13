import { describe, expect, it } from 'bun:test'
import { absoluteUrl, clampDescription } from './text'
import { SEO } from './constants'
import { watchPath } from '../lib/utils'

describe('SEO text helpers', () => {
  it('makes image paths absolute and leaves full URLs alone', () => {
    expect(absoluteUrl('/og-image.png')).toBe(`${SEO.SITE_URL}/og-image.png`)
    expect(absoluteUrl('og-image.png')).toBe(`${SEO.SITE_URL}/og-image.png`)
    expect(absoluteUrl('https://image.tmdb.org/t/p/w1280/x.jpg')).toBe('https://image.tmdb.org/t/p/w1280/x.jpg')
  })

  it('keeps short descriptions whole', () => {
    expect(clampDescription('  A short   one. ')).toBe('A short one.')
  })

  it('cuts long descriptions on a word boundary within 160 characters', () => {
    const long = 'word '.repeat(60)
    const out = clampDescription(long)
    expect(out.length).toBeLessThanOrEqual(160)
    expect(out.endsWith('word…')).toBe(true)
  })
})

describe('watchPath', () => {
  it('matches the app route the cards navigate to', () => {
    expect(watchPath('tv', 1398, 'The Sopranos')).toBe('/watch/tv/1398-the-sopranos')
    expect(watchPath('movie', 27205, 'Inception')).toBe('/watch/movie/27205-inception')
    expect(watchPath('movie', 42, '東京')).toBe('/watch/movie/42')
  })
})
