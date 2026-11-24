import { describe, it, expect, beforeEach } from 'bun:test'
import {
  audioLanguageFor,
  rememberAudioLanguage,
  releaseLanguageRank,
  releaseLanguages,
  pickAudioTrack,
  withAudioLanguage,
  withAudioTrack,
  trackLanguage,
  channelLabel,
  audioBaseFor,
  audioLanguageChoices,
  releaseHasLanguage,
} from './audioLanguage'
import { rankReleasesForPlayback } from './releasePlayback'
import type { DebridAudioTrack, DebridReadyPlayback, DebridRelease } from './debridApi'

function release(name: string, languages?: string[], extra: Partial<DebridRelease> = {}): DebridRelease {
  return {
    id: name,
    name,
    info_hash: name,
    seeders: '10',
    leechers: '0',
    size: String(1.5 * 1024 ** 3),
    num_files: '1',
    username: 'torrentio',
    added: '0',
    category: '208',
    cached: true,
    ...(languages ? { languages } : {}),
    ...extra,
  }
}

const track = (id: string, langIso: string, lang = langIso): DebridAudioTrack => ({ id, lang, langIso, codec: 'eac3', channels: 5.1 })

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

describe('the language a title plays in', () => {
  it('is Hindi for a Hindi original, English for the rest', () => {
    expect(audioLanguageFor({ id: 1, original_language: 'hi' }, 'tv')).toBe('hi')
    expect(audioLanguageFor({ id: 2, original_language: 'en' }, 'movie')).toBe('en')
    expect(audioLanguageFor({ id: 3, original_language: 'ko' }, 'tv')).toBe('en')
    expect(audioLanguageFor({ id: 4 }, 'movie')).toBe('en')
  })

  it('plays anime in Japanese, with English to switch to', () => {
    const frieren = { id: 5, original_language: 'ja', genres: [{ id: 16 }] }
    expect(audioLanguageFor(frieren, 'tv')).toBe('ja')
    expect(audioBaseFor(frieren)).toBe('ja')
    expect(audioLanguageChoices(frieren)).toEqual(['ja', 'en'])
    // A Japanese film that isn't animation is like any other
    expect(audioLanguageFor({ id: 6, original_language: 'ja', genres: [{ id: 18 }] }, 'movie')).toBe('en')
    expect(audioLanguageChoices({ id: 7, original_language: 'hi' })).toEqual(['hi', 'en'])
    expect(audioLanguageChoices({ id: 8, original_language: 'en' })).toEqual(['en', 'hi'])
  })

  it("is the viewer's own pick for the title once they made one", () => {
    rememberAudioLanguage('tv', 1, 'en')
    expect(audioLanguageFor({ id: 1, original_language: 'hi' }, 'tv')).toBe('en')
    // Another title keeps its own
    expect(audioLanguageFor({ id: 9, original_language: 'hi' }, 'tv')).toBe('hi')
  })
})

describe("a release's languages", () => {
  it('reads names and Torrentio tags', () => {
    expect([...releaseLanguages(release('The Family Man (2019) Hindi S01 1080p AMZN WEBRip x264 DD 5.1 MSubs', ['in']))]).toEqual(['hi'])
    expect(releaseLanguages(release('The Family Man (2025) S03 EP01-07 WEBDL 1080p [Hin.Tam.Tel.Eng] (DD5.1 AAC2.0) ESub', ['en', 'in']))).toEqual(
      new Set(['hi', 'ta', 'te', 'en'])
    )
    expect([...releaseLanguages(release('The.Family.Man.S03.1080p.AMZN.WEB-DL.DDP5.1.H.265-REL1VIN', ['in']))]).toEqual(['in'])
    expect(releaseLanguages(release('Family Man S01E01 - MoviePirate [Telly].mkv')).size).toBe(0)
  })

  it("doesn't take English subtitles for English audio", () => {
    expect(releaseLanguages(release('Jawan 2023 Hindi 1080p WEBRip Eng Subs')).has('en')).toBe(false)
  })
})

describe('ranking releases for the language', () => {
  // Torrentio's answer for The Family Man S03E01 (2026-11-24), cut down
  const familyMan = [
    release('The Family Man 2019 S03E01 The Peace Problem 1080p AMZN WEB-DL DD 5 1 H 264-playWEB'),
    release('The.Family.Man.2019.S03E01.1080p.WEB.h264-EDITH'),
    release('The Family Man (2025) S03 1080p 10bit DS4K AMZN WEBRip x265 HEVC Hindi DDP 5.1 ESub - Immortal', ['in']),
    release('The.Family.Man.S03.1080p.AMZN.WEB-DL.DDP5.1.H.265-REL1VIN', ['in']),
  ]
  const support = { hevc: true, av1: true }

  it('plays a Hindi original from a Hindi release', () => {
    const ranked = rankReleasesForPlayback(familyMan, support, { audioLang: 'hi', appConvertsAudio: true })
    expect(ranked[0].name).toContain('Hindi')
    expect(ranked[1].name).toContain('REL1VIN')
    expect(ranked.slice(2).every((r) => !r.languages)).toBe(true)
  })

  it('keeps English first for everything else', () => {
    const ranked = rankReleasesForPlayback(familyMan, support, { appConvertsAudio: true })
    expect(ranked.slice(0, 2).every((r) => !r.languages)).toBe(true)
  })

  it('puts the language before the picture', () => {
    const ranked = rankReleasesForPlayback(
      [release('Jawan 2023 2160p NF WEB-DL DDP5.1 HEVC', ['in']), release('Jawan 2023 Hindi 1080p NF WEB-DL AAC5.1 H.264')],
      support,
      { audioLang: 'hi' }
    )
    expect(ranked[0].name).toContain('Hindi')
    expect(releaseLanguageRank(release('Movie 2020 1080p ITA'), 'en')).toBe(1)
    expect(releaseLanguageRank(release('Movie 2020 1080p'), 'en')).toBe(0)
  })
})

describe('the audio track that plays', () => {
  const tracks = [track('eng1', 'eng', 'English'), track('hin1', 'hin', 'Hindi'), track('tam1', 'tam', 'Tamil')]

  it('is the one in the wanted language', () => {
    expect(pickAudioTrack(tracks, 'hi', 'eng1')).toBe('hin1')
    expect(pickAudioTrack(tracks, 'en', 'eng1')).toBe('eng1')
  })

  it("is the file's first when none is labelled with it — a Hindi release's own language usually comes first", () => {
    expect(pickAudioTrack([track('und1', 'und'), track('eng1', 'eng')], 'hi', 'eng1')).toBe('und1')
  })

  it("switches Real-Debrid's transcode along with the track", () => {
    const playback: DebridReadyPlayback = {
      status: 'ready',
      torrentId: 't',
      fileId: 1,
      fileName: 'f.mkv',
      fileSize: 1,
      mimeType: 'video/x-matroska',
      directUrl: 'https://rd/f.mkv',
      hls: 'https://rd/eng.m3u8',
      hlsAudio: { eng1: 'https://rd/eng.m3u8', hin1: 'https://rd/hin.m3u8', tam1: 'https://rd/tam.m3u8' },
      media: { videoCodec: 'h264', audioTracks: tracks, selectedAudio: 'eng1', duration: 3000 },
    }
    const hindi = withAudioLanguage(playback, 'hi')
    expect(hindi.media?.selectedAudio).toBe('hin1')
    expect(hindi.hls).toBe('https://rd/hin.m3u8')
    expect(withAudioTrack(hindi, 'tam1').hls).toBe('https://rd/tam.m3u8')
    // Nothing to change: the same object
    expect(withAudioLanguage(playback, 'en')).toBe(playback)
  })

  it('names tracks and channels as people say them', () => {
    expect(trackLanguage({ langIso: 'hin', lang: 'Hindi' })).toBe('hi')
    expect(trackLanguage({ langIso: 'und', lang: 'und' })).toBeNull()
    expect(trackLanguage({ langIso: '', lang: 'English' })).toBe('en')
    expect(channelLabel(5.1)).toBe('5.1')
    expect(channelLabel(2)).toBe('Stereo')
    expect(channelLabel(6)).toBe('5.1')
  })
})

describe('anime releases', () => {
  // Torrentio's answer for Frieren S01E01 and Your Name (2026-11-25), cut down; tags as the backend reads them
  const subsPlease = release('[SubsPlease] Sousou no Frieren - 01 (1080p) [F02B9CEE].mkv')
  const eraiRaws = release('[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][HEVC][BATCH][Multiple Subtitle] [ENG][POR-BR][SPA-LA]', ['en', 'ru', 'it'])
  const dual = release("[Judas] Sousou no Frieren (Season 01) [BD 1080p][HEVC x265 10bit][Dual-Audio]", ['dub', 'multi', 'en'])
  const englishDub = release('[Bl4ckĐevil] Your Name - Kimi No Na Wa [4K-UHD] [English Dub]', ['dub', 'en'])
  const germanDub = release('Sousou no Frieren - Beyond Journeys End S1 Ger Dub (1080p) HDR', ['dub', 'de'])
  const russian = release('Магическая битва / Jujutsu Kaisen [S01-02] (2020-2023) BDRip-HEVC 1080p', ['ru'])

  it('take a release that names no language for the Japanese — its flags are subtitles', () => {
    for (const r of [subsPlease, eraiRaws, dual]) expect(releaseLanguageRank(r, 'ja', 'ja')).toBe(0)
    for (const r of [englishDub, germanDub, russian]) expect(releaseLanguageRank(r, 'ja', 'ja')).toBe(3)
  })

  it('find English in a dub, then a dual-audio release, never a fansub', () => {
    expect(releaseLanguageRank(englishDub, 'en', 'ja')).toBe(0)
    expect(releaseLanguageRank(dual, 'en', 'ja')).toBe(1)
    expect(releaseLanguageRank(eraiRaws, 'en', 'ja')).toBe(2)
    expect(releaseLanguageRank(germanDub, 'en', 'ja')).toBe(3)
    expect(releaseHasLanguage(dual, 'en', 'ja')).toBe(true)
    expect(releaseHasLanguage(subsPlease, 'en', 'ja')).toBe(false)
    expect(releaseHasLanguage(subsPlease, 'ja', 'ja')).toBe(true)
  })

  it('rank for the language picked', () => {
    const support = { hevc: true, av1: true }
    const all = [germanDub, englishDub, subsPlease, dual]
    expect(rankReleasesForPlayback(all, support, { audioLang: 'ja', audioBase: 'ja', appConvertsAudio: true }).slice(-2)).toEqual(
      expect.arrayContaining([germanDub, englishDub])
    )
    expect(rankReleasesForPlayback(all, support, { audioLang: 'en', audioBase: 'ja', appConvertsAudio: true })[0]).toBe(englishDub)
  })
})
