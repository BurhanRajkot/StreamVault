import { describe, it, expect } from 'bun:test'
import {
  selectBalancedReleases,
  isLikelyNonEnglishRelease,
  isDifferentSequel,
  filesToSelect,
  pickPlaybackFile,
  findEpisodeFile,
  tvReleaseCoverage,
  accountErrorMessage,
  DebridError,
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

describe('findEpisodeFile', () => {
  const pick = (paths: string[], season: number, episode: number) =>
    findEpisodeFile(paths.map((p, i) => file(i + 1, p)), season, episode)?.id ?? null

  it('reads SxxEyy in its common spellings', () => {
    expect(pick(['/Show.S05E02.mkv', '/Show.S05E03.mkv'], 5, 3)).toBe(2)
    expect(pick(['/Show S5 E2.mkv', '/Show S5 E3.mkv'], 5, 3)).toBe(2)
    expect(pick(['/Show.S05.EP02.mkv', '/Show.S05.EP03.mkv'], 5, 3)).toBe(2)
  })

  it('does not confuse episode 3 with 13 or season 5 with 15', () => {
    expect(pick(['/Show.S05E13.mkv', '/Show.S15E03.mkv', '/Show.S05E03.mkv'], 5, 3)).toBe(3)
  })

  it('reads 5x03 numbering', () => {
    expect(pick(['/Show 15x03.mkv', '/Show 5x03.mkv'], 5, 3)).toBe(2)
  })

  it('reads a bare episode number, ignoring years', () => {
    expect(pick(['/2008 - 01 - Pilot.mkv', '/2008 - 03 - Bee.mkv'], 2, 3)).toBe(2)
  })

  it('returns null when nothing matches', () => {
    expect(pick(['/Show.S05E01.mkv', '/Show.S05E02.mkv'], 5, 9)).toBeNull()
  })
})

describe('accountErrorMessage', () => {
  it('flags a blocked server IP and other account-wide failures', () => {
    expect(accountErrorMessage(new DebridError('x', 400, 22))).toContain('IP address')
    expect(accountErrorMessage(new DebridError('x', 503, 23))).toContain('traffic')
    expect(accountErrorMessage(new DebridError('x', 401))).toContain('token')
  })

  it('leaves release-specific failures alone', () => {
    expect(accountErrorMessage(new DebridError('x', 451, 35))).toBeNull()
    expect(accountErrorMessage(new DebridError('x', 400, 30))).toBeNull()
    expect(accountErrorMessage(new Error('network'))).toBeNull()
  })
})

describe('tvReleaseCoverage', () => {
  const got = (name: string, season = 1, episode = 1) => tvReleaseCoverage(name, 'Game of Thrones 2011', season, episode)

  it('takes the episode itself, and only that episode', () => {
    expect(got('Game of Thrones S01E01 Winter Is Coming 1080p BluRay x264-OFT')).toBe('episode')
    expect(got('Game.of.Thrones.s01e01.720p.HDTV.x264-CTU [eztv]')).toBe('episode')
    expect(got('Game of Thrones 1x01 HDTV')).toBe('episode')
    expect(got('Game of Thrones S01E02 1080p')).toBeNull()
    expect(got('Game of Thrones S02E01 1080p')).toBeNull()
  })

  it('takes the season pack holding it', () => {
    expect(got('Game.of.Thrones.S01.COMPLETE.1080p.10bit.BluRay.6CH.x265.HEVC-PSA')).toBe('season')
    expect(got('Game of Thrones - Season 1 - 720p BluRay - x264 - ShAaNiG')).toBe('season')
    expect(got('Game Of Thrones S01 Season 1 1080p 5.1Ch BluRay ReEnc-DeeJayAhmed')).toBe('season')
    expect(got('Game.of.Thrones.S03.COMPLETE.1080p.BluRay')).toBeNull()
    expect(got('Game of Thrones - Season 8 S08 - 2019 1080p Bluray')).toBeNull()
  })

  it('takes multi-season and whole-series packs that span the season', () => {
    expect(got('Game.of.Thrones.Season.1-8.S01-08.COMPLETE.1080p.BluRay.WEB.x265')).toBe('multi-season')
    expect(got('Game of Thrones S01-S04 BluRay 1080p', 3)).toBe('multi-season')
    expect(got('Game.of.Thrones.Complete.Series.Season.1.2.3.4.5.6.7.8.x264.720p', 6)).toBe('multi-season')
    expect(got('Game of Thrones Season 1-7 1 2 3 4 5 6 7 Complete 1080p', 7)).toBe('multi-season')
    expect(got('Game of Thrones Complete Series 1080p', 5)).toBe('multi-season')
    expect(got('Game of Thrones S01-S04 BluRay 1080p', 6)).toBeNull()
  })

  it('ignores other shows that mention the title, and names that say nothing', () => {
    expect(got('The Kingdom The Worlds Most Powerful Prince S01E01 Game of Thrones 1080p')).toBeNull()
    expect(got('Game of Thrones Conquest and Rebellion 2017 1080p')).toBeNull()
    expect(got('Thrones S01E01')).toBeNull()
  })

  it('reads past [site] tags and resolution numbers', () => {
    expect(got('[ACESSE COMANDOTORRENTS.COM] Game of Thrones S01E01 1080p')).toBe('episode')
    expect(got('Game of Thrones S01 1080p 2011', 1)).toBe('season')
    expect(got('Game of Thrones S01 1080p 2011', 10)).toBeNull()
  })
})

describe('findEpisodeFile in multi-season packs', () => {
  const file = (id: number, path: string): DebridTorrentFile => ({ id, path, bytes: 1, selected: 1 })
  // Real layout of "The.Office Season 1-8 [720p]" on Real-Debrid
  const office = [
    file(1, '/The.Office - Season 1 [720p]/The.Office S01E01 - Pilot [720p].mkv'),
    file(2, '/The.Office - Season 1 [720p]/The.Office S01E02 -Diversity Day [720p].mkv'),
    file(64, '/The.Office - Season 4 [720p]/The.Office S04E03&04 - Dunder Mifflin Infinity [720p].mkv'),
    file(65, '/The.Office - Season 4 [720p]/The.Office S04E01&02 - Fun Run [720p].mkv'),
    file(66, '/The.Office - Season 4 [720p]/The.Office S04E14 - Chair Model [720p].mkv'),
  ]

  it('finds an episode that shares a file with the one before it', () => {
    expect(findEpisodeFile(office, 4, 2)?.id).toBe(65)
    expect(findEpisodeFile(office, 4, 1)?.id).toBe(65)
    expect(findEpisodeFile(office, 4, 4)?.id).toBe(64)
    expect(findEpisodeFile(office, 1, 2)?.id).toBe(2)
  })

  it('reads the other double-episode spellings', () => {
    const files = [file(1, 'Show.S02E05-E06.mkv'), file(2, 'Show.S02E07E08.mkv'), file(3, 'Show.S02E09-10.mkv')]
    expect(findEpisodeFile(files, 2, 6)?.id).toBe(1)
    expect(findEpisodeFile(files, 2, 8)?.id).toBe(2)
    expect(findEpisodeFile(files, 2, 10)?.id).toBe(3)
  })

  it("doesn't read a resolution after a dash as an episode range", () => {
    expect(findEpisodeFile([file(1, 'Show.S01E02-1080p.mkv')], 1, 500)).toBeNull()
  })

  it('never falls back to the same episode number from another season', () => {
    expect(findEpisodeFile(office, 4, 7)).toBeNull()
    const byFolder = [file(1, '/Season 1/02 - Pilot.mkv'), file(2, '/Season 3/02 - Other.mkv')]
    expect(findEpisodeFile(byFolder, 3, 2)?.id).toBe(2)
    expect(findEpisodeFile(byFolder, 2, 2)).toBeNull()
  })
})
