import { afterEach, describe, expect, it } from 'bun:test'
import {
  addonSearchPath,
  fetchSubtitleFile,
  findSubtitles,
  fromAddonSubtitle,
  fromRestResult,
  looksLikeSubtitles,
  rankSubtitles,
  releaseGroupOf,
  restSearchPath,
  sourceKind,
  SubtitleFileError,
  type SubtitleCandidate,
} from './subtitles'
import * as cache from '../services/cache'

/** A candidate with sensible defaults: an English SubRip for the whole film, in timing group 1. */
function sub(overrides: Partial<SubtitleCandidate> = {}): SubtitleCandidate {
  return {
    id: String(Math.floor(Math.random() * 1e9)),
    lang: 'eng',
    release: 'Inception.2010.1080p.BluRay.x264-CtrlHD',
    format: 'srt',
    downloads: 1000,
    hearingImpaired: false,
    trusted: false,
    bad: false,
    rating: 0,
    cds: 1,
    foreignPartsOnly: false,
    machineTranslated: false,
    timingGroup: '1',
    lastCue: 8439,
    releaseGroup: '',
    source: 'BluRay',
    ...overrides,
  }
}

const BLURAY_FILE = { name: 'Inception.2010.1080p.BluRay.x264-SPARKS.mkv', duration: 8880 }

describe('restSearchPath', () => {
  it('drops "tt" and leading zeros, and orders the parameters alphabetically', () => {
    expect(restSearchPath({ imdbId: 'tt0944947', mediaType: 'tv', season: 1, episode: 3 }, 'eng')).toBe(
      'episode-3/imdbid-944947/season-1/sublanguageid-eng'
    )
    expect(restSearchPath({ imdbId: 'tt1375666', mediaType: 'movie' })).toBe('imdbid-1375666')
  })
})

describe('addonSearchPath', () => {
  it('addresses an episode as imdb:season:episode', () => {
    expect(addonSearchPath({ imdbId: 'tt0944947', mediaType: 'tv', season: 1, episode: 3 })).toBe(
      'subtitles/series/tt0944947:1:3.json'
    )
    expect(addonSearchPath({ imdbId: 'tt1375666', mediaType: 'movie' })).toBe('subtitles/movie/tt1375666.json')
  })
})

describe('fromRestResult', () => {
  it('reads the legacy API’s string flags and timing fields', () => {
    const c = fromRestResult({
      IDSubtitleFile: '1952777677',
      SubLanguageID: 'eng',
      LanguageName: 'English',
      MovieReleaseName: ' Inception.2010.1080p.BluRay.DTS.x264-CtrlHD\nInception.720p.BluRay ',
      SubFormat: 'SRT',
      SubDownloadsCnt: '300441',
      SubHearingImpaired: '1',
      SubFromTrusted: '1',
      SubBad: '0',
      SubSumCD: '1',
      SubForeignPartsOnly: '0',
      SubAutoTranslation: '0',
      SubTSGroup: '1',
      SubLastTS: '02:20:39',
      InfoReleaseGroup: 'CtrlHD',
      InfoFormat: 'BluRay',
    })
    expect(c).toMatchObject({
      id: '1952777677',
      format: 'srt',
      downloads: 300441,
      hearingImpaired: true,
      trusted: true,
      bad: false,
      timingGroup: '1',
      lastCue: 8439,
      release: 'Inception.2010.1080p.BluRay.DTS.x264-CtrlHD',
    })
  })

  it('rejects a record without a usable file id or language', () => {
    expect(fromRestResult({ IDSubtitleFile: 'abc', SubLanguageID: 'eng' })).toBeNull()
    expect(fromRestResult({ IDSubtitleFile: '123', SubLanguageID: 'english' })).toBeNull()
  })
})

describe('fromAddonSubtitle', () => {
  it('takes the file id from the download URL and OpenSubtitles’ language code', () => {
    const c = fromAddonSubtitle({
      id: '4166126',
      url: 'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1952846466',
      lang: 'ell',
      g: '1',
      subtitleFileName: 'Game.of.Thrones.S01E01.720p.HDTV.DD5.1.x264-EbP.HI.srt',
      movieReleaseName: 'Game.of.Thrones.S01E01.720p.HDTV.DD5.1.x264-EbP',
      releaseGroup: 'EbP',
      releaseFormat: 'HDTV',
    })
    expect(c).toMatchObject({ id: '1952846466', lang: 'gre', hearingImpaired: true, timingGroup: '1', format: 'srt' })
  })

  it('skips an entry without a file URL', () => {
    expect(fromAddonSubtitle({ lang: 'eng' })).toBeNull()
  })
})

describe('releaseGroupOf', () => {
  it.each([
    ['Inception.2010.1080p.BluRay.x264-SPARKS.mkv', 'sparks'],
    ['Severance S01E01 Good News About Hell 1080p BluRay 10Bit DDP5 1 H265-d3g.mkv', 'd3g'],
    ['Severance.S01E01.2160p.WEB.H265-GLHF[rartv]', 'glhf'],
    ['Inception.2010.1080p.BrRip.x264.YIFY.mp4', 'yify'],
    ['Severance - S01E01 - Good News About Hell.mkv', null],
  ])('%s → %s', (name, group) => {
    expect(releaseGroupOf(name)).toBe(group)
  })
})

describe('sourceKind', () => {
  it('tells rips apart', () => {
    expect(sourceKind('Inception.2010.HDCAM.x264')).toBe('cam')
    expect(sourceKind('Telesync')).toBe('cam')
    expect(sourceKind('Show.S01E01.1080p.WEBRip.x264')).toBe('web')
    expect(sourceKind('Show.S01E01.1080p.ATVP.WEB-DL')).toBe('web')
    expect(sourceKind('Inception.2010.1080p.BluRay.x264')).toBe('bluray')
  })

  it('doesn’t take an MPEG-TS file for a TeleSync', () => {
    expect(sourceKind('Show.S01E01.1080p.HDTV.ts')).toBe('hdtv')
  })
})

describe('rankSubtitles', () => {
  it('puts a cinema recording’s subtitles below the film’s, however popular', () => {
    const cam = sub({ id: '1', release: 'Inception.2010.CAM.Xvid-LKRG', source: 'Cam', downloads: 900_000, trusted: true, timingGroup: '8' })
    const bluray = sub({ id: '2', downloads: 20_000 })
    const [eng] = rankSubtitles([cam, bluray], BLURAY_FILE)
    expect(eng.options.map((o) => o.id)).toEqual(['2', '1'])
  })

  it('prefers the subtitle made for the very release playing', () => {
    const popular = sub({ id: '1', downloads: 300_000, trusted: true })
    const exact = sub({ id: '2', release: 'Inception.2010.1080p.BluRay.x264-SPARKS', downloads: 500, timingGroup: '3' })
    const [eng] = rankSubtitles([popular, exact], BLURAY_FILE)
    expect(eng.options[0].id).toBe('2')
  })

  it('favours the timing most subtitles share', () => {
    const odd = sub({ id: '1', downloads: 5000, timingGroup: '7', release: 'Inception.2010.720p.x264' })
    const common = [
      sub({ id: '2', downloads: 3000, timingGroup: '1', release: 'Inception.2010.DVDRip', source: 'DVD' }),
      sub({ id: '3', downloads: 3000, timingGroup: '1', hearingImpaired: true, release: 'Inception.2010.DVDRip', source: 'DVD' }),
    ]
    const [eng] = rankSubtitles([odd, ...common], { name: 'Inception.2010.720p.x264.mkv', duration: 8880 })
    expect(eng.options[0].id).toBe('2')
  })

  it('never offers parts, forced-only, machine translations, unplayable formats or a subtitle that ends mid-film', () => {
    const candidates = [
      sub({ id: '1', cds: 2 }),
      sub({ id: '2', foreignPartsOnly: true }),
      sub({ id: '3', machineTranslated: true }),
      sub({ id: '4', format: 'sub' }),
      sub({ id: '5', lastCue: 3000 }),
      sub({ id: '6' }),
    ]
    const [eng] = rankSubtitles(candidates, BLURAY_FILE)
    expect(eng.options.map((o) => o.id)).toEqual(['6'])
  })

  it('pushes back a subtitle still talking after the file ends', () => {
    const long = sub({ id: '1', downloads: 100_000, lastCue: 9500 })
    const fits = sub({ id: '2', downloads: 100, timingGroup: '2' })
    const [eng] = rankSubtitles([long, fits], BLURAY_FILE)
    expect(eng.options[0].id).toBe('2')
  })

  it('offers one version per timing (and hearing-impaired or not), at most six', () => {
    const same = [sub({ id: '1', downloads: 9 }), sub({ id: '2', downloads: 5 }), sub({ id: '3', hearingImpaired: true })]
    const others = Array.from({ length: 8 }, (_, i) => sub({ id: String(10 + i), timingGroup: String(10 + i) }))
    const [eng] = rankSubtitles([...same, ...others], BLURAY_FILE)
    expect(eng.options).toHaveLength(6)
    expect(eng.options.map((o) => o.id)).toContain('1')
    expect(eng.options.map((o) => o.id)).not.toContain('2')
  })

  it('lists English first, then the other languages by name', () => {
    const langs = rankSubtitles([sub({ lang: 'spa' }), sub({ lang: 'ara' }), sub({ lang: 'eng' }), sub({ lang: 'pob' })])
    expect(langs.map((l) => l.name)).toEqual(['English', 'Arabic', 'Portuguese (Brazil)', 'Spanish'])
  })

  it('gives each id once, keeping the first record of it', () => {
    const [eng] = rankSubtitles([sub({ id: '1', release: 'From OpenSubtitles' }), sub({ id: '1', release: 'From the addon' })])
    expect(eng.options).toEqual([{ id: '1', release: 'From OpenSubtitles', hearingImpaired: false }])
  })
})

describe('looksLikeSubtitles', () => {
  it('recognises SubRip, WebVTT and SubStation text, and nothing else', () => {
    expect(looksLikeSubtitles('1\n00:01:02,345 --> 00:01:04,000\nHi')).toBe(true)
    expect(looksLikeSubtitles('WEBVTT\n\n00:01:02.345 --> 00:01:04.000\nHi')).toBe(true)
    expect(looksLikeSubtitles('[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi')).toBe(true)
    expect(looksLikeSubtitles('<html><body>Not found</body></html>')).toBe(false)
  })
})

describe('fetchSubtitleFile', () => {
  it('refuses an id that isn’t an OpenSubtitles file id', async () => {
    const err = await fetchSubtitleFile('../../etc/passwd').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SubtitleFileError)
    expect((err as SubtitleFileError).status).toBe(400)
  })
})

describe('findSubtitles', () => {
  const realFetch = globalThis.fetch
  afterEach(async () => {
    globalThis.fetch = realFetch
    await cache.subtitles.flush()
  })

  it('needs a season and an episode for a show', async () => {
    expect(await findSubtitles({ imdbId: 'tt0944947', mediaType: 'tv' })).toEqual([])
  })

  it('merges OpenSubtitles and the addon, and still answers when one of them fails', async () => {
    const asked: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      asked.push(url)
      if (url.includes('/search/imdbid-1375666/sublanguageid-eng')) {
        return Response.json([
          { IDSubtitleFile: '11', SubLanguageID: 'eng', SubFormat: 'srt', SubTSGroup: '1', SubLastTS: '02:20:39', MovieReleaseName: 'Inception.BluRay' },
        ])
      }
      if (url.includes('/search/imdbid-1375666')) return new Response('down', { status: 503 })
      if (url.includes('opensubtitles-v3')) {
        return Response.json({ subtitles: [{ url: 'https://subs5.strem.io/x/file/22', lang: 'fra', g: '2', subtitleFileName: 'Inception.srt' }] })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const langs = await findSubtitles({ imdbId: 'tt1375666', mediaType: 'movie', file: BLURAY_FILE })
    expect(langs.map((l) => [l.code, l.options.map((o) => o.id)])).toEqual([
      ['eng', ['11']],
      ['fre', ['22']],
    ])
    expect(asked.some((u) => u.endsWith('/search/imdbid-1375666'))).toBe(true)
  })
})
