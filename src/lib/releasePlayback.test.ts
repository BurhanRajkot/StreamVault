import { describe, it, expect } from 'bun:test'
import {
  parseVideoCodec,
  assumedVideoCodec,
  isDolbyVisionOnly,
  isBrowserPlayable,
  rankReleasesForPlayback,
  canDecodeVideoCodec,
  planPlaybackModes,
} from './releasePlayback'
import type { DebridRelease, DebridReadyPlayback, DebridMediaSummary } from './debridApi'

const release = (name: string, opts: { cached?: boolean; size?: number; seeders?: number } = {}): DebridRelease => ({
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
  cached: opts.cached ?? true,
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

describe('canDecodeVideoCodec', () => {
  it('always decodes h264 and decodes hevc/av1 only when supported', () => {
    expect(canDecodeVideoCodec('h264', noHevc)).toBe(true)
    expect(canDecodeVideoCodec('hevc', noHevc)).toBe(false)
    expect(canDecodeVideoCodec('hevc', withHevc)).toBe(true)
    expect(canDecodeVideoCodec('vc1', withHevc)).toBe(false)
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

  it('passes over releases that declare Dolby/DTS audio, since those need the unseekable transcode', () => {
    const ranked = rankReleasesForPlayback(
      [release('Show.S01E01.1080p.WEB.DDP5.1.x264'), release('Show.S01E01.720p.WEB.AAC.x264'), release('Show.S01E01.1080p.WEB.x264')],
      noHevc
    )
    expect(ranked.map((r) => r.name)).toEqual([
      'Show.S01E01.1080p.WEB.x264',
      'Show.S01E01.720p.WEB.AAC.x264',
      'Show.S01E01.1080p.WEB.DDP5.1.x264',
    ])
  })

  it('ranks cached above uncached among playable releases', () => {
    const ranked = rankReleasesForPlayback(breakingBad, noHevc)
    const uncachedIndex = ranked.findIndex((r) => !r.cached)
    const lastCachedPlayable = ranked.filter((r) => r.cached && isBrowserPlayable(r.name, noHevc)).length - 1
    expect(uncachedIndex).toBeGreaterThan(lastCachedPlayable)
  })
})

describe('planPlaybackModes', () => {
  const media = (overrides: Partial<DebridMediaSummary> = {}): DebridMediaSummary => ({
    videoCodec: 'h264',
    audioTracks: [{ id: 'eng1', lang: 'English', langIso: 'eng', codec: 'aac', channels: 2 }],
    selectedAudio: 'eng1',
    duration: 7200,
    ...overrides,
  })
  const playback = (m: DebridMediaSummary | null): DebridReadyPlayback => ({
    status: 'ready',
    torrentId: 'ABCDEFGHIJKLM',
    fileId: 1,
    fileName: 'Movie.2010.1080p.mkv',
    fileSize: 2 * GB,
    mimeType: 'video/x-matroska',
    directUrl: 'https://x.download.real-debrid.com/d/ID/Movie.mkv',
    hls: 'https://x.stream.real-debrid.com/t/ID/eng1/none/aac/full.m3u8',
    media: m,
  })
  const kinds = (p: DebridReadyPlayback, support = noHevc) => planPlaybackModes(p, support).map((m) => m.label)

  it('plays H.264 + AAC directly first', () => {
    expect(kinds(playback(media()))).toEqual(['Direct', 'RD stream'])
  })

  it('goes through the RD transcode first for E-AC3 audio', () => {
    const eac3 = media({ audioTracks: [{ id: 'eng1', lang: 'English', langIso: 'eng', codec: 'eac3', channels: 6 }] })
    expect(kinds(playback(eac3))).toEqual(['RD stream', 'Direct'])
  })

  it('goes through the RD transcode first for HEVC only when the browser lacks it', () => {
    expect(kinds(playback(media({ videoCodec: 'hevc' })))[0]).toBe('RD stream')
    expect(kinds(playback(media({ videoCodec: 'hevc' })), withHevc)[0]).toBe('Direct')
  })

  it('uses the transcode when the English track is not the first one', () => {
    const dubFirst = media({
      audioTracks: [
        { id: 'rus1', lang: 'Russian', langIso: 'rus', codec: 'aac', channels: 2 },
        { id: 'eng1', lang: 'English', langIso: 'eng', codec: 'aac', channels: 2 },
      ],
    })
    expect(kinds(playback(dubFirst))[0]).toBe('RD stream')
  })

  it('tries direct first when there is no media info', () => {
    expect(kinds(playback(null))).toEqual(['Direct', 'RD stream'])
  })
})
