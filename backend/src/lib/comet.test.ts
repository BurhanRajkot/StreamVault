import { describe, it, expect } from 'bun:test'
import { cometTorrentCandidates, type CometStream } from './comet'

const HASH = 'd162efa8bf4385b3f7fa79c89efad74501010de3'

// Shape returned by the public Comet instance with a debrid key configured
// (captured Sept 2026): no top-level infoHash, hash only in bingeGroup.
const resolvedStream: CometStream = {
  name: '[TB⚡] Comet 2160p',
  description:
    '📄 The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv\n📹 hevc • DV • HDR\n💾 70.8 GB 🔎 Comet',
  url: 'https://comet.example/playback/opaque-token',
  behaviorHints: {
    bingeGroup: `comet|torbox|${HASH}`,
    filename: 'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv',
    videoSize: 76013195525,
  },
}

describe('cometTorrentCandidates', () => {
  it('recovers the info-hash from bingeGroup when infoHash is absent', () => {
    const [candidate] = cometTorrentCandidates([resolvedStream])
    expect(candidate.infoHash).toBe(HASH.toUpperCase())
    expect(candidate.size).toBe(76013195525)
  })

  it('uses the filename as the release name, not the multi-line description', () => {
    const [candidate] = cometTorrentCandidates([resolvedStream])
    expect(candidate.name).toBe(
      'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv'
    )
    expect(candidate.name).not.toContain('\n')
  })

  it('falls back to the first description line without the emoji prefix', () => {
    const [candidate] = cometTorrentCandidates([
      { ...resolvedStream, behaviorHints: { bingeGroup: `comet|torbox|${HASH}` } },
    ])
    expect(candidate.name).toBe(
      'The.Grand.Budapest.Hotel.2014.2160p.UHD.Blu-ray.Remux.DV.HDR.HEVC.DTS-HD.MA.5.1-CiNEPHiLES.mkv'
    )
  })

  it('flags streams Comet tagged as cached', () => {
    const uncached = { ...resolvedStream, name: '[TB⬇️] Comet 2160p' }
    const [cached, notCached] = cometTorrentCandidates([resolvedStream, uncached])
    expect(cached.cachedHint).toBe(true)
    expect(notCached.cachedHint).toBe(false)
  })

  it('still accepts a top-level infoHash', () => {
    const [candidate] = cometTorrentCandidates([{ infoHash: HASH, title: 'Some.Release.1080p' }])
    expect(candidate.infoHash).toBe(HASH.toUpperCase())
    expect(candidate.name).toBe('Some.Release.1080p')
  })

  it('skips streams with no recoverable hash', () => {
    expect(
      cometTorrentCandidates([
        { name: 'no hash at all' },
        { behaviorHints: { bingeGroup: 'comet|torbox|not-a-hash' } },
      ])
    ).toEqual([])
  })
})
