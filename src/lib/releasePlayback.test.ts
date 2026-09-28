import { describe, it, expect } from 'bun:test'
import {
  parseVideoCodec,
  assumedVideoCodec,
  isDolbyVisionOnly,
  isBrowserPlayable,
  rankReleasesForPlayback,
  supportedFfprobeCodecs,
} from './releasePlayback'
import { findEpisodeFile, type TorboxFile, type TorboxSearchResult } from './torboxApi'

const release = (name: string, opts: { cached?: boolean; size?: number; seeders?: number } = {}): TorboxSearchResult => ({
  id: name,
  name,
  info_hash: name,
  seeders: String(opts.seeders ?? 0),
  leechers: '0',
  size: String(opts.size ?? 0),
  num_files: '1',
  username: 'torrentio',
  added: '0',
  category: '208',
  torbox_cached: opts.cached ?? true,
})

const noHevc = { hevc: false, av1: false }
const withHevc = { hevc: true, av1: false }
const GB = 1024 ** 3

describe('parseVideoCodec / assumedVideoCodec', () => {
  it.each([
    ['Breaking Bad S02E03 2160p NF WEB-DL DDP5 1 H 265-XEBEC', 'hevc'],
    ['Our.Planet.S01E03.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.H.265-CRYBABIES.mkv', 'hevc'],
    ['Planet Earth II S01E02 Mountains (2160p x265 10bit Joy).mkv', 'hevc'],
    ['Show.S01E01.1080p.WEB.H264-GROUP', 'avc'],
    ['Show.S01E01.1080p.WEBRip.x264.AAC', 'avc'],
    ['Show.S01E01.1080p.WEB-DL.AV1.Opus', 'av1'],
    ['Show.S01E01.1080p.WEB-DL', null],
  ])('%s → %p', (name, expected) => {
    expect(parseVideoCodec(name)).toBe(expected as ReturnType<typeof parseVideoCodec>)
  })

  it('assumes HEVC for undeclared 4K and H.264 for undeclared 1080p', () => {
    expect(assumedVideoCodec('Show.S01E01.2160p.WEB-DL.mkv')).toBe('hevc')
    expect(assumedVideoCodec('Show.S01E01.1080p.WEB-DL.mkv')).toBe('avc')
  })
})

describe('isDolbyVisionOnly', () => {
  it('flags DV with no HDR10 base layer', () => {
    expect(isDolbyVisionOnly('Our.Planet.S01E03.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.H.265-CRYBABIES.mkv')).toBe(true)
  })
  it('allows DV/HDR10 hybrids', () => {
    expect(isDolbyVisionOnly('Our.Planet.S01E03.Jungles.2160p.NF.WEB-DL.DDP.5.1.Atmos.HDR.DoVi.by.DVT.mkv')).toBe(false)
    expect(isDolbyVisionOnly('Movie.2160p.DV.HDR10.WEB-DL.mkv')).toBe(false)
  })
})

describe('isBrowserPlayable', () => {
  it('rejects HEVC only when the browser lacks it', () => {
    const name = 'Breaking Bad S02E03 2160p NF WEB-DL DDP5 1 H 265-XEBEC'
    expect(isBrowserPlayable(name, noHevc)).toBe(false)
    expect(isBrowserPlayable(name, withHevc)).toBe(true)
  })
})

describe('supportedFfprobeCodecs', () => {
  it('always includes h264 and adds hevc/av1 only when supported', () => {
    expect(supportedFfprobeCodecs(noHevc)).toEqual(['h264', 'vp8', 'vp9'])
    expect(supportedFfprobeCodecs({ hevc: true, av1: true })).toContain('hevc')
  })
})

describe('rankReleasesForPlayback', () => {
  // Shape of the real Breaking Bad S02E03 result that auto-picked a 2160p H.265 file.
  const breakingBad = [
    release('Breaking Bad S02E03 Bit by a Dead Bee 2160p NF WEB-DL DDP5 1 H 265-XEBEC', { size: 5.9 * GB, seeders: 37 }),
    release('Breaking.Bad.S02E03.2160p.WEB-DL.5xRus.Ukr.Eng.TrollUHD-ULTRAHDCLUB.mkv', { size: 39 * GB, seeders: 27 }),
    release('Breaking.Bad.S02E03.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1', { size: 9 * GB }),
    release('Breaking.Bad.S02E03.1080p.BluRay.x264.DDP5.1', { size: 3 * GB }),
    release('Breaking.Bad.S02E03.1080p.WEBRip.x264.AAC', { size: 1.2 * GB }),
    release('Breaking.Bad.S02E03.1080p.WEB.x264', { size: 1.5 * GB, cached: false, seeders: 90 }),
  ]

  it('puts a browser-safe 1080p H.264 release first when HEVC is unsupported', () => {
    const ranked = rankReleasesForPlayback(breakingBad, noHevc)
    expect(ranked[0].name).toBe('Breaking.Bad.S02E03.1080p.WEBRip.x264.AAC')
    // Remux and a codec this browser can't decode sink below the normal encodes.
    expect(ranked.findIndex((r) => r.name.includes('REMUX'))).toBeGreaterThan(1)
    expect(ranked.slice(-2).every((r) => /2160p/.test(r.name))).toBe(true)
  })

  it('still prefers 1080p over 4K when HEVC is supported, but ranks 4K above 720p', () => {
    const ranked = rankReleasesForPlayback(
      [release('Show.S01E01.720p.WEB.x264'), release('Show.S01E01.2160p.WEB.H265'), release('Show.S01E01.1080p.WEB.x264')],
      withHevc
    )
    expect(ranked.map((r) => r.name)).toEqual([
      'Show.S01E01.1080p.WEB.x264',
      'Show.S01E01.2160p.WEB.H265',
      'Show.S01E01.720p.WEB.x264',
    ])
  })

  it('ranks cached above uncached among playable releases', () => {
    const ranked = rankReleasesForPlayback(breakingBad, noHevc)
    const uncachedIndex = ranked.findIndex((r) => !r.torbox_cached)
    const lastCachedPlayable = ranked.filter((r) => r.torbox_cached && isBrowserPlayable(r.name, noHevc)).length - 1
    expect(uncachedIndex).toBeGreaterThan(lastCachedPlayable)
  })
})

describe('findEpisodeFile', () => {
  const file = (id: number, name: string): TorboxFile => ({
    id,
    md5: null,
    s3_path: name,
    name,
    size: 1000 + id,
    mimetype: 'video/x-matroska',
    short_name: name,
  })

  it('matches "EP02"-style episode numbering in season packs', () => {
    const files = [
      file(1, 'Planet.Earth.II.S01.EP01.Islands.2160p.mkv'),
      file(2, 'Planet.Earth.II.S01.EP02.Mountains.2160p.mkv'),
      file(3, 'Planet.Earth.II.S01.EP03.Jungles.2160p.mkv'),
    ]
    expect(findEpisodeFile(files, 1, 2)?.id).toBe(2)
  })
})
