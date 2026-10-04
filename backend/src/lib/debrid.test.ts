import { describe, it, expect } from 'bun:test'
import {
  selectBalancedReleases,
  isLikelyNonEnglishRelease,
  isDifferentSequel,
  filesToSelect,
  pickPlaybackFile,
  type DebridRelease,
  type DebridTorrentFile,
} from './debrid'

const release = (name: string, cached = true, seeders = 0): DebridRelease => ({
  id: name,
  name,
  info_hash: name,
  seeders: String(seeders),
  leechers: '0',
  size: '0',
  num_files: '1',
  username: 'torrentio',
  added: '0',
  category: '207',
  cached,
})

describe('selectBalancedReleases', () => {
  it('keeps 1080p releases when 4K alone would fill the limit', () => {
    // Dune: Part Two returned 15 × 4K and zero 1080p before this.
    const releases = [
      ...Array.from({ length: 30 }, (_, i) => release(`Dune.Part.Two.2024.2160p.WEB-DL.${i}.mkv`)),
      ...Array.from({ length: 10 }, (_, i) => release(`Dune.Part.Two.2024.1080p.WEB-DL.${i}.mkv`)),
    ]
    const picked = selectBalancedReleases(releases, 15)
    expect(picked).toHaveLength(15)
    expect(picked.filter((r) => r.name.includes('1080p')).length).toBeGreaterThanOrEqual(6)
    // Still best-first: every 4K result precedes every 1080p one.
    const firstHd = picked.findIndex((r) => r.name.includes('1080p'))
    expect(picked.slice(firstHd).every((r) => r.name.includes('1080p'))).toBe(true)
  })

  it('fills unused reserved slots from other tiers', () => {
    const releases = [
      release('Show.S01E01.2160p.WEB.mkv'),
      ...Array.from({ length: 20 }, (_, i) => release(`Show.S01E01.1080p.WEB.${i}.mkv`)),
    ]
    expect(selectBalancedReleases(releases, 15)).toHaveLength(15)
  })

  it('orders cached, then English, releases first within a tier', () => {
    const picked = selectBalancedReleases(
      [
        release('Inception.2010.1080p.BluRay.uncached.mkv', false, 500),
        release('Начало.2010.1080p.BDRip.mkv'),
        release('Inception.2010.1080p.BluRay.x264.mkv'),
      ],
      3
    )
    expect(picked.map((r) => r.name)).toEqual([
      'Inception.2010.1080p.BluRay.x264.mkv',
      'Начало.2010.1080p.BDRip.mkv',
      'Inception.2010.1080p.BluRay.uncached.mkv',
    ])
  })
})

describe('isLikelyNonEnglishRelease', () => {
  it.each([
    ['Начало.2010.UHD.BDRip.1080p.mkv', true],
    ['Dune - Part Two (2024) AC3 5.1 ITA 2160p H265.mkv', true],
    ['Oppenheimer.2023.IMAX.4K.HDR.DV.2160p.BDRip Ita Eng x265-NAHOM.mkv', false],
    ['Shōgun S01E03 4K [ProtonMovies].mkv', false],
    ['Oppenheimer (2023) IMAX MULTi VFF 2160p 10bit 4KLight HDR BluRay DDP 5.1 x265-QTZ.mkv', false],
    ['Mirzapur.S02.E010.1080p.WEB-DL.[Hindi + Esub][LV444]✒.mkv', true],
  ])('%s → %p', (name, expected) => {
    expect(isLikelyNonEnglishRelease(name)).toBe(expected)
  })
})

describe('isDifferentSequel', () => {
  it.each([
    ['Planet.Earth.III.S01E02.Ocean.UHD.BluRay.2160p.TrueHD.Atmos.7.1.HEVC.mkv', 'Planet Earth II', true],
    ['Planet.Earth.II.S01.EP02.Mountains.2016.2160p.BluRay.REMUX.mkv', 'Planet Earth II', false],
    ['Planet Earth 2 S01E02 1080p WEB x264', 'Planet Earth II', false],
    ['Planet Earth S01E02 1080p', 'Planet Earth II', false],
    ['Planet.Earth.II.S01E01.2160p.mkv', 'Planet Earth', true],
    ['Toy.Story.2.1999.1080p.BluRay.x264', 'Toy Story 1995', true],
    ['Toy.Story.1995.1080p.BluRay.x264', 'Toy Story 1995', false],
    ['Blade.Runner.2049.2017.2160p.WEB-DL.mkv', 'Blade Runner 2049 2017', false],
    ['Malcolm.X.1992.1080p.BluRay.x264', 'Malcolm X 1992', false],
    ['Breaking Bad S02E03 Bit by a Dead Bee 2160p NF WEB-DL', 'Breaking Bad', false],
    ['Во все тяжкие S02E03 1080p', 'Breaking Bad', false],
  ])('%s for "%s" → %p', (name, title, expected) => {
    expect(isDifferentSequel(name, title)).toBe(expected)
  })
})

const file = (id: number, path: string, bytes = 1_000_000_000, selected = 1): DebridTorrentFile => ({
  id,
  path,
  bytes,
  selected,
})

describe('filesToSelect', () => {
  it('selects every video file except samples', () => {
    expect(
      filesToSelect([
        file(1, '/Inception.2010.1080p.mkv'),
        file(2, '/Inception.2010.1080p.mkv.nfo', 849),
        file(3, '/Sample/inception-sample.mkv', 50_000_000),
        file(4, '/Torrent Downloaded From UIndex.org.txt', 129),
      ])
    ).toEqual([1])
  })

  it('selects every episode of a season pack', () => {
    expect(
      filesToSelect([file(1, '/Show.S01/Show.S01E01.mkv'), file(2, '/Show.S01/Show.S01E02.mkv'), file(3, '/Show.S01/info.txt', 10)])
    ).toEqual([1, 2])
  })

  it('keeps a sample when it is the only video', () => {
    expect(filesToSelect([file(1, '/clip-sample.mp4'), file(2, '/readme.txt', 10)])).toEqual([1])
  })
})

describe('pickPlaybackFile', () => {
  const pack = [
    file(1, '/Show.S01/Show.S01E01.1080p.mkv', 900),
    file(2, '/Show.S01/Show.S01E02.1080p.mkv', 800),
    file(3, '/Show.S01/Show.S01E03.1080p.mkv', 1000),
  ]

  it('picks the requested episode from a season pack', () => {
    expect(pickPlaybackFile(pack, { season: 1, episode: 2 })?.id).toBe(2)
  })

  it('prefers the file Torrentio matched by name', () => {
    expect(pickPlaybackFile(pack, { fileName: 'Show.S01E01.1080p.mkv', season: 1, episode: 3 })?.id).toBe(1)
  })

  it("maps Torrentio's 0-based file index onto Real-Debrid's 1-based ids", () => {
    expect(pickPlaybackFile(pack, { fileIdx: 1 })?.id).toBe(2)
  })

  it('matches "EP02"-style episode numbering in season packs', () => {
    const planetEarth = [
      file(1, '/Planet.Earth.II.S01.EP01.Islands.2160p.mkv'),
      file(2, '/Planet.Earth.II.S01.EP02.Mountains.2160p.mkv'),
      file(3, '/Planet.Earth.II.S01.EP03.Jungles.2160p.mkv'),
    ]
    expect(pickPlaybackFile(planetEarth, { season: 1, episode: 2 })?.id).toBe(2)
  })

  it('falls back to the largest video', () => {
    expect(pickPlaybackFile(pack)?.id).toBe(3)
  })
})
