import { describe, it, expect } from 'bun:test'
import { selectBalancedReleases, isLikelyNonEnglishRelease, type TorboxSearchResult } from './torbox'

const release = (name: string, cached = true, seeders = 0): TorboxSearchResult => ({
  id: name,
  name,
  info_hash: name,
  seeders: String(seeders),
  leechers: '0',
  size: '0',
  num_files: '1',
  username: 'comet',
  added: '0',
  category: '207',
  torbox_cached: cached,
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
