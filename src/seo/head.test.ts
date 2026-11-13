import { describe, expect, it } from 'bun:test'
import { mergeHead } from './head'

describe('mergeHead', () => {
  it('lets the page mounted last win, key by key', () => {
    const merged = mergeHead([
      {
        title: 'Home',
        meta: [{ name: 'description', content: 'home' }, { property: 'og:type', content: 'website' }],
        links: [{ rel: 'canonical', href: '/' }],
        jsonLd: [{ id: 'site', data: 1 }, { id: 'page', data: 'home' }],
      },
      {
        title: 'Inception',
        meta: [{ name: 'description', content: 'film' }],
        links: [{ rel: 'canonical', href: '/watch/movie/27205-inception' }],
        jsonLd: [{ id: 'page', data: 'film' }, { id: 'title', data: 'Movie' }],
      },
    ])
    expect(merged.title).toBe('Inception')
    expect(merged.meta.get('name:description')?.content).toBe('film')
    // Keys the top page doesn't set fall through to the one underneath
    expect(merged.meta.get('property:og:type')?.content).toBe('website')
    expect(merged.links.get('canonical')).toBe('/watch/movie/27205-inception')
    expect([...merged.jsonLd]).toEqual([['site', 1], ['page', 'film'], ['title', 'Movie']])
  })

  it('is empty with nothing mounted', () => {
    const merged = mergeHead([])
    expect(merged.title).toBeUndefined()
    expect(merged.meta.size).toBe(0)
  })
})
