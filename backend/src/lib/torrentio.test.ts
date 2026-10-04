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

  it('uses the first title line as the release name, not the multi-line title', () => {
    const [candidate] = torrentioTorrentCandidates([stream])
    expect(candidate.name).toBe(
      'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv'
    )
    expect(candidate.name).not.toContain('\n')
  })

  it('falls back to the filename when there is no title', () => {
    const [candidate] = torrentioTorrentCandidates([{ ...stream, title: undefined }])
    expect(candidate.name).toBe(stream.behaviorHints?.filename ?? '')
  })

  it('skips streams with no info-hash', () => {
    expect(torrentioTorrentCandidates([{ name: 'no hash at all' }])).toEqual([])
  })

  it('skips streams with a malformed info-hash', () => {
    expect(torrentioTorrentCandidates([{ infoHash: 'not-a-hash' }])).toEqual([])
  })

  it('reports keyless results as not cached', () => {
    expect(torrentioTorrentCandidates([stream])[0].cached).toBe(false)
  })
})

describe('torrentioTorrentCandidates (Real-Debrid mode)', () => {
  const rdStream = (cachedTag: string): TorrentioStream => ({
    name: `${cachedTag} Torrentio\n1080p`,
    title: 'Inception (2010) 1080p BrRip x264 - 1.85GB - YIFY\n👤 120 💾 1.85 GB ⚙️ YTS',
    url: `https://torrentio.strem.fun/resolve/realdebrid/SECRETKEY/${HASH}/null/3/Inception.2010.1080p.BrRip.x264.YIFY.mp4`,
    behaviorHints: { filename: 'Inception.2010.1080p.BrRip.x264.YIFY.mp4' },
  })

  it('recovers the info-hash and file index from the resolve URL', () => {
    const [candidate] = torrentioTorrentCandidates([rdStream('[RD+]')])
    expect(candidate.infoHash).toBe(HASH.toUpperCase())
    expect(candidate.fileIdx).toBe(3)
    expect(candidate.fileName).toBe('Inception.2010.1080p.BrRip.x264.YIFY.mp4')
  })

  it('reads the [RD+] cache tag', () => {
    expect(torrentioTorrentCandidates([rdStream('[RD+]')])[0].cached).toBe(true)
    expect(torrentioTorrentCandidates([rdStream('[RD download]')])[0].cached).toBe(false)
  })

  it('never carries the resolve URL (and its key) into the candidate', () => {
    expect(JSON.stringify(torrentioTorrentCandidates([rdStream('[RD+]')]))).not.toContain('SECRETKEY')
  })
})
