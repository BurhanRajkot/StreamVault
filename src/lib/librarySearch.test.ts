import { describe, it, expect } from 'bun:test'
import { libraryHitFromPath, libraryPlayPath, libraryReleaseSource, type LibraryHit } from './librarySearch'

const hit: LibraryHit = {
  torrentId: 'ABC123',
  hash: 'ab'.repeat(20),
  torrentName: 'Some Pack 1080p',
  added: '2026-11-01T00:00:00.000Z',
  file: { id: 3, path: '/Some Pack/Ep 1 & more.mkv', name: 'Ep 1 & more.mkv', bytes: 1234, video: true },
}

describe('library player address', () => {
  it('round-trips a hit, including odd characters in names', () => {
    const [path, search] = libraryPlayPath(hit).split('?')
    const back = libraryHitFromPath(path.split('/').pop(), `?${search}`)
    expect(back?.file?.name).toBe('Ep 1 & more.mkv')
    expect(back?.file?.id).toBe(3)
    expect(back?.torrentName).toBe('Some Pack 1080p')
  })
  it('rejects a bad hash or a missing torrent', () => {
    expect(libraryHitFromPath('nope', '?torrent=A&name=B')).toBeNull()
    expect(libraryHitFromPath(hit.hash, '?name=B')).toBeNull()
  })
})

describe('libraryReleaseSource', () => {
  it('offers the one file as a cached release with a 0-based index', async () => {
    const [release] = await libraryReleaseSource(hit).find({ fresh: false })
    expect(release.cached).toBe(true)
    expect(release.file_idx).toBe(2)
    expect(release.file_name).toBe('Ep 1 & more.mkv')
    expect(release.info_hash).toBe(hit.hash.toUpperCase())
  })
})
