import { describe, it, expect } from 'bun:test'
import { matchLibrary, normalizeText, searchTokens, type IndexedFile } from './debridLibrary'
import type { DebridTorrent } from './debrid'

const torrent = (id: string, filename: string, status: DebridTorrent['status'] = 'downloaded'): DebridTorrent => ({
  id,
  filename,
  hash: id.toLowerCase().padEnd(40, '0'),
  bytes: 1,
  host: 'real-debrid.com',
  split: 2000,
  progress: 100,
  status,
  added: '2026-11-01T00:00:00.000Z',
  links: [],
})

describe('searchTokens', () => {
  it('splits on any separator and dedupes', () => {
    expect(searchTokens('Sex.Ten  ten')).toEqual(['sex', 'ten'])
  })
  it('keeps non-latin words', () => {
    expect(normalizeText('Amélie_2001')).toBe('amélie 2001')
  })
})

describe('matchLibrary', () => {
  const index = new Map<string, IndexedFile[]>([
    [
      'B',
      [
        { id: 1, path: '/Pack/Sex.Ten.2024.mkv', bytes: 900 },
        { id: 2, path: '/Pack/readme.txt', bytes: 1 },
      ],
    ],
  ])
  const torrents = [torrent('A', 'Sex.Ten.1080p.WEB'), torrent('B', 'Some.Pack'), torrent('C', 'Sex.Ten.broken', 'error')]

  it('needs every word, across torrent name and file path', () => {
    const hits = matchLibrary(torrents, index, ['sex', 'ten'], 50)
    expect(hits.map((h) => `${h.torrentId}:${h.file?.name ?? '-'}`)).toEqual(['A:-', 'B:Sex.Ten.2024.mkv'])
  })
  it('a torrent whose files are indexed matches by file, not by name alone', () => {
    expect(matchLibrary(torrents, index, ['readme'], 50).map((h) => h.file?.name)).toEqual(['readme.txt'])
    expect(matchLibrary(torrents, index, ['pack', 'sex'], 50).map((h) => h.file?.name)).toEqual(['Sex.Ten.2024.mkv'])
  })
  it('skips torrents that are not finished, and honours the limit', () => {
    expect(matchLibrary(torrents, index, ['broken'], 50)).toEqual([])
    expect(matchLibrary(torrents, index, ['sex'], 1)).toHaveLength(1)
  })
  it('lists video files before others', () => {
    const hits = matchLibrary([torrent('B', 'Some.Pack')], index, ['pack'], 50)
    expect(hits[0].file?.video).toBe(true)
  })
})
