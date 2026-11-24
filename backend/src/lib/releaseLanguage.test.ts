import { describe, it, expect } from 'bun:test'
import { releaseLanguageRank, releaseLanguages, torrentioLanguages } from './releaseLanguage'
import { selectBalancedReleases, type DebridRelease } from './debrid'

const row = (name: string, languages?: string[]): DebridRelease => ({
  id: name,
  name,
  info_hash: name,
  seeders: '5',
  leechers: '0',
  size: '1000',
  num_files: '1',
  username: 'torrentio',
  added: '0',
  category: '208',
  cached: true,
  ...(languages ? { languages } : {}),
})

describe("Torrentio's language tags", () => {
  it('reads the last line of a result', () => {
    expect(torrentioLanguages('The Family Man S01 1080p\nFamily Man S01E01.mkv\n👤 3 💾 1.31 GB ⚙️ ThePirateBay\nMulti Subs / 🇮🇳')).toEqual(['in'])
    expect(torrentioLanguages('Name\n👤 1 💾 495 MB ⚙️ 1337x\nDual Audio / 🇬🇧 / 🇮🇳')).toEqual(['multi', 'en', 'in'])
    // No tag line
    expect(torrentioLanguages('The.Family.Man.2019.S03E01.1080p.WEB.h264-EDITH\n👤 2 💾 4.29 GB ⚙️ ThePirateBay')).toEqual([])
  })
})

describe('the release search for a language', () => {
  it('keeps Hindi releases of a Hindi original within the limit, first', () => {
    const rows = [
      row('The.Family.Man.2019.S03E01.1080p.WEB.h264-EDITH'),
      row('The Family Man 2019 S03E01 1080p AMZN WEB-DL DD 5 1 H 264-playWEB'),
      row('The Family Man S03 (2025) Hindi 1080p WEBRip x265 DDP 5.1 ESub', ['in']),
    ]
    expect(selectBalancedReleases(rows, 2, 'hi').map((r) => r.name)).toEqual([rows[2].name, rows[0].name])
    // English, as before: the unlabelled ones
    expect(selectBalancedReleases(rows, 2).map((r) => r.name)).not.toContain(rows[2].name)
  })

  it('ranks names it can read', () => {
    expect(releaseLanguages('[Hin.Tam.Tel.Eng] ESub', ['en', 'in'])).toEqual(new Set(['en', 'hi', 'ta', 'te']))
    expect(releaseLanguageRank('Jawan 2023 Hindi 1080p', [], 'hi', true)).toBe(0)
    expect(releaseLanguageRank('Jawan 2023 1080p', ['in'], 'hi', false)).toBe(1)
    expect(releaseLanguageRank('Jawan 2023 1080p', [], 'hi', false)).toBe(2)
    expect(releaseLanguageRank('Jawan 2023 [Tamil] 1080p', ['in'], 'hi', true)).toBe(3)
    expect(releaseLanguageRank('Jawan 2023 Hindi 1080p', [], 'en', true)).toBe(1)
  })
})
