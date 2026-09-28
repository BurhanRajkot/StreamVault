import { describe, it, expect } from 'bun:test'
import { torrentioTorrentCandidates, type TorrentioStream } from './torrentio'

const HASH = 'd162efa8bf4385b3f7fa79c89efad74501010de3'

const stream: TorrentioStream = {
  name: 'Torrentio\n2160p',
  title:
    'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv\n👤 42 💾 70.8 GB ⚙️ 1337x',
  infoHash: HASH,
  fileIdx: 0,
  behaviorHints: {
    filename: 'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv',
    bingeGroup: 'torrentio|2160p|BluRay REMUX|HEVC|DV|HDR',
  },
}

describe('torrentioTorrentCandidates', () => {
  it('reads the info-hash directly', () => {
    const [candidate] = torrentioTorrentCandidates([stream])
    expect(candidate.infoHash).toBe(HASH.toUpperCase())
  })

  it('parses seeders from the title text', () => {
    const [candidate] = torrentioTorrentCandidates([stream])
    expect(candidate.seeders).toBe(42)
  })

  it('parses size from the title text', () => {
    const [candidate] = torrentioTorrentCandidates([stream])
    expect(candidate.size).toBeCloseTo(70.8 * 1024 ** 3, -3)
  })

  it('uses the filename as the release name, not the multi-line title', () => {
    const [candidate] = torrentioTorrentCandidates([stream])
    expect(candidate.name).toBe(
      'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv'
    )
    expect(candidate.name).not.toContain('\n')
  })

  it('falls back to the first title line when no filename is present', () => {
    const [candidate] = torrentioTorrentCandidates([{ ...stream, behaviorHints: undefined }])
    expect(candidate.name).toBe(
      'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv'
    )
  })

  it('skips streams with no info-hash', () => {
    expect(torrentioTorrentCandidates([{ name: 'no hash at all' }])).toEqual([])
  })

  it('skips streams with a malformed info-hash', () => {
    expect(torrentioTorrentCandidates([{ infoHash: 'not-a-hash' }])).toEqual([])
  })
})
