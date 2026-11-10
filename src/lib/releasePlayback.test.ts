import { describe, it, expect } from 'bun:test'
import {
  parseVideoCodec,
  assumedVideoCodec,
  isDolbyVisionOnly,
  isBrowserPlayable,
  rankReleasesForPlayback,
  canDecodeVideoCodec,
  planPlaybackModes,
  convertedStreamUrl,
  planConvertedSeek,
  CONVERTED_SEEK_AHEAD_S,
  isTheatricalRip,
  isLikelyDirectPlayable,
  previewStreamUrl,
  declaresBrowserAudio,
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

  // Shape of the real Dune: Part Two result (2026-11-08): a 37 GB Russian
  // "BDRemux" and a telesync were picked ahead of an ordinary encode.
  it('sinks "BDRemux" spellings and cam/telesync rips below ordinary encodes', () => {
    const ranked = rankReleasesForPlayback(
      [
        release('Дюна: Часть вторая / Dune: Part Two [2024 BDRemux 1080p] Dub + Original (Eng)', { size: 37 * GB, seeders: 9 }),
        release('Dune.Part.Two.2024.1080p.HD-TS.X264-EMIN3M[TGx]', { size: 2 * GB, seeders: 300 }),
        release('Dune.Part.Two.2024.1080p.WEBRip.x264.AAC-LAMA', { size: 3 * GB, seeders: 50 }),
      ],
      noHevc
    )
    expect(ranked[0].name).toBe('Dune.Part.Two.2024.1080p.WEBRip.x264.AAC-LAMA')
    expect(ranked[2].name).toMatch(/HD-TS/)
  })

  it('ranks cached above uncached among playable releases', () => {
    const ranked = rankReleasesForPlayback(breakingBad, noHevc)
    const uncachedIndex = ranked.findIndex((r) => !r.cached)
    const lastCachedPlayable = ranked.filter((r) => r.cached && isBrowserPlayable(r.name, noHevc)).length - 1
    expect(uncachedIndex).toBeGreaterThan(lastCachedPlayable)
  })
})

describe('rankReleasesForPlayback — audio languages', () => {
  // The shape of Sinners' list on 2026-11-10: a Hindi-first "Dual" WEB-DL
  // (IMAX, so it won every other tie) over a single-language YTS encode.
  const sinners = [
    release('Sinners.2025.IMAX.1080p.WEB-DL.H.264.Dual.YG', { size: 7.6 * GB, seeders: 97 }),
    release('Sinners (2025) [1080p] [WEBRip] [5.1] [YTS.MX]', { size: 2.5 * GB, seeders: 343 }),
  ]

  it('puts a one-language release ahead of a dual-audio one of the same resolution', () => {
    expect(rankReleasesForPlayback(sinners, noHevc)[0].name).toContain('YTS')
  })

  it('treats a language pair like "iTA-ENG" as dual audio too, IMAX or not', () => {
    const ranked = rankReleasesForPlayback(
      [release('I.Peccatori.2025.iTA-ENG.iMAX.Bluray.1080p.x264-CYBER.mkv', { seeders: 50 }), release('Sinners (2025) 1080p BluRay 5.1-LAMA', { seeders: 10 })],
      noHevc
    )
    expect(ranked[0].name).toContain('LAMA')
  })

  it('still prefers 1080p over resolution-less or 720p single-language releases', () => {
    const ranked = rankReleasesForPlayback([release('Movie.2024.720p.WEB.x264.AAC'), release('Movie.2024.1080p.WEB-DL.MULTi.x264')], noHevc)
    expect(ranked[0].name).toContain('1080p')
  })
})

describe('isTheatricalRip', () => {
  it.each(['Movie.2024.HDCAM.x264', 'Movie 2024 1080p HD-TS X264', 'Movie.2024.TELESYNC.XviD', 'Movie.2024.HDTC.x264', 'Movie.2024.DVDScr.XviD', 'Movie 2024 CAMRip'])(
    'flags %s',
    (name) => expect(isTheatricalRip(name)).toBe(true)
  )
  it.each(['Movie.2024.1080p.WEB-DL.DDP5.1.H.264', 'Movie.2024.1080p.BluRay.DTS.x264', 'Movie.2024.1080p.WEBRip.x264.AAC'])(
    'leaves %s alone',
    (name) => expect(isTheatricalRip(name)).toBe(false)
  )
})

describe('isLikelyDirectPlayable', () => {
  it('expects AAC or undeclared audio in a decodable codec to play from the file', () => {
    expect(isLikelyDirectPlayable('Show.S01E01.1080p.WEB.x264.AAC', noHevc)).toBe(true)
    expect(isLikelyDirectPlayable('Show.S01E01.1080p.WEB.x264', noHevc)).toBe(true)
  })
  it('expects Dolby/DTS audio, remuxes and undecodable video to need the transcode', () => {
    expect(isLikelyDirectPlayable('Show.S01E01.1080p.WEB.DDP5.1.x264', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Movie.2024.1080p.BDRemux.AVC', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Show.S01E01.1080p.WEB.x265.AAC', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Show.S01E01.1080p.WEB.x265.AAC', withHevc)).toBe(true)
  })
  it('expects a dual- or multi-language release may need the transcode for its English track', () => {
    expect(isLikelyDirectPlayable('Sinners.2025.IMAX.1080p.WEB-DL.H.264.Dual.YG', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Movie.2024.1080p.WEB-DL.MULTi.x264', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Movie.2024.1080p.Dual-Audio.x264', noHevc)).toBe(false)
    // Language pairs, as Torrentio lists file names (Sinners, 2026-11-10: Italian AC3 first)
    expect(isLikelyDirectPlayable('I.Peccatori.2025.iTA-ENG.iMAX.Bluray.1080p.x264-CYBER.mkv', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Breaking.Bad.S02E03.1080p.WEB-DL.5xRus.Ukr.Eng.x264', noHevc)).toBe(false)
    // English alone is just English
    expect(isLikelyDirectPlayable('Movie.2024.1080p.WEB-DL.ENG.x264', noHevc)).toBe(true)
  })
  it('never counts on a cam/telesync, which would then be played over a converted proper copy', () => {
    expect(isLikelyDirectPlayable('Sinners.2025.1080p.TeleSync.X264.COLLECTiVE', noHevc)).toBe(false)
    expect(isLikelyDirectPlayable('Movie.2025.HDCAM.x264', noHevc)).toBe(false)
  })
})

describe('declaresBrowserAudio', () => {
  it('trusts AAC/Opus/MP3 in the name, and YTS/YIFY encodes (always AAC)', () => {
    expect(declaresBrowserAudio('Show.S01E01.1080p.WEB.x264.AAC')).toBe(true)
    expect(declaresBrowserAudio('Sinners (2025) [1080p] [WEBRip] [5.1] [YTS.MX]')).toBe(true)
    expect(declaresBrowserAudio('Movie (2010) 1080p BrRip x264 - YIFY')).toBe(true)
  })
  it('promises nothing for undeclared or Dolby/DTS audio', () => {
    expect(declaresBrowserAudio('Show.S01E01.1080p.WEB.x264')).toBe(false)
    expect(declaresBrowserAudio('Show.S01E01.1080p.WEB.DDP5.1.x264')).toBe(false)
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

  it('plays from the nearest server first, with the link as given behind it', () => {
    const near = 'https://mum1.download.real-debrid.com/d/ID44/Movie.mkv'
    expect(planPlaybackModes(playback(media()), noHevc, near).map((m) => m.url)).toEqual([
      near,
      playback(null).directUrl,
      playback(null).hls,
    ])
    // Both direct links stay behind the transcode when it has to go first
    const eac3 = media({ audioTracks: [{ id: 'eng1', lang: 'English', langIso: 'eng', codec: 'eac3', channels: 6 }] })
    expect(planPlaybackModes(playback(eac3), noHevc, near).map((m) => m.kind)).toEqual(['hls', 'direct', 'direct'])
    // Not listed twice when it's the same link
    expect(planPlaybackModes(playback(media()), noHevc, playback(null).directUrl)).toHaveLength(2)
  })

  it('tries direct first when there is no media info', () => {
    expect(kinds(playback(null))).toEqual(['Direct', 'RD stream'])
  })

  it('previews frames from the file whenever the browser decodes its video, whatever the audio', () => {
    const eac3 = media({ audioTracks: [{ id: 'eng1', lang: 'English', langIso: 'eng', codec: 'eac3', channels: 6 }] })
    expect(previewStreamUrl(playback(eac3), noHevc)).toBe(playback(eac3).directUrl)
    expect(previewStreamUrl(playback(null), noHevc)).toBe(playback(null).directUrl)
    expect(previewStreamUrl(playback(media({ videoCodec: 'hevc' })), noHevc)).toBeNull()
    expect(previewStreamUrl(playback(media({ videoCodec: 'hevc' })), withHevc)).not.toBeNull()
  })
})

describe('convertedStreamUrl', () => {
  const url = 'https://4.stream.real-debrid.com/t/ABC123/eng1/none/aac/full.m3u8'

  it('leaves the stream alone when it starts at the beginning', () => {
    expect(convertedStreamUrl(url, 0)).toBe(url)
    expect(convertedStreamUrl(url, 0.9)).toBe(url)
  })

  it('asks Real-Debrid to start converting at the given second', () => {
    expect(convertedStreamUrl(url, 1800)).toBe(`${url}?t=1800`)
    expect(convertedStreamUrl(url, 1800.7)).toBe(`${url}?t=1800`)
  })

  it('adds to a query string that is already there', () => {
    expect(convertedStreamUrl(`${url}?x=1`, 60)).toBe(`${url}?x=1&t=60`)
  })
})

describe('planConvertedSeek', () => {
  it('seeks within what is loaded, in the element’s own time', () => {
    // Stream restarted at 30:00; 90s of it loaded.
    expect(planConvertedSeek(1850, 1800, 90)).toEqual({ kind: 'local', time: 50 })
  })

  it('leaves a jump just past what is loaded to the running conversion', () => {
    expect(planConvertedSeek(1800 + 90 + CONVERTED_SEEK_AHEAD_S, 1800, 90)).toEqual({
      kind: 'local',
      time: 90 + CONVERTED_SEEK_AHEAD_S,
    })
  })

  it('restarts the conversion for a jump far ahead', () => {
    expect(planConvertedSeek(5000, 1800, 90)).toEqual({ kind: 'restart', at: 5000 })
  })

  it('restarts the conversion for a jump back before where the stream starts', () => {
    expect(planConvertedSeek(600.5, 1800, 90)).toEqual({ kind: 'restart', at: 600 })
    expect(planConvertedSeek(0, 1800, 90)).toEqual({ kind: 'restart', at: 0 })
  })

  it('restarts when the stream has not loaded yet', () => {
    expect(planConvertedSeek(1810, 1800, null)).toEqual({ kind: 'restart', at: 1810 })
  })
})
