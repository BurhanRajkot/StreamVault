import { describe, expect, it } from 'bun:test'
import { buildSitemapXml, slugify, watchUrl, SITE_URL } from './sitemap'

describe('title sitemap', () => {
  it('slugifies exactly like the frontend does', () => {
    expect(slugify('Spider-Man: Across the Spider-Verse')).toBe('spider-man-across-the-spider-verse')
    expect(slugify('  The   Office  ')).toBe('the-office')
    expect(slugify('Amélie')).toBe('amlie')
  })

  it('builds the same watch URLs the app routes to', () => {
    expect(watchUrl('tv', 1398, 'The Sopranos')).toBe(`${SITE_URL}/watch/tv/1398-the-sopranos`)
    // A title that slugifies to nothing keeps a bare id, which the route still accepts
    expect(watchUrl('movie', 42, '東京')).toBe(`${SITE_URL}/watch/movie/42`)
  })

  it('escapes XML and lists every URL', () => {
    const xml = buildSitemapXml(['https://x.test/a?b=1&c=2', 'https://x.test/d'], '2026-11-13')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<loc>https://x.test/a?b=1&amp;c=2</loc>')
    expect(xml.match(/<url>/g)?.length).toBe(2)
    expect(xml).toContain('<lastmod>2026-11-13</lastmod>')
  })
})
