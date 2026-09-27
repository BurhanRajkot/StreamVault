import { describe, it, expect } from 'bun:test'
import { buildSegmentStarts, buildPlaylist } from './hlsVod'

describe('buildSegmentStarts', () => {
  it('groups keyframes into segments of at least the target length', () => {
    const keyframes = [0, 2, 4, 6, 8, 10, 12, 14]
    expect(buildSegmentStarts(keyframes, 16, 6)).toEqual([0, 6, 12])
  })

  it('never starts a segment on a keyframe that is immediately followed by another', () => {
    // 6.0 is followed by 6.1, so a seek there could land on either; 6.1 is used instead.
    expect(buildSegmentStarts([0, 3, 6, 6.1, 9, 12.5, 15], 20, 6)).toEqual([0, 6.1, 12.5])
  })

  it('does not leave a sub-second final segment', () => {
    expect(buildSegmentStarts([0, 6, 12, 17.5], 18, 6)).toEqual([0, 6, 12])
  })

  it('keeps long GOPs as single segments', () => {
    expect(buildSegmentStarts([0, 10.4, 20.8, 31.2], 40, 6)).toEqual([0, 10.4, 20.8, 31.2])
  })
})

describe('buildPlaylist', () => {
  it('is a complete VOD playlist covering the full duration', () => {
    const playlist = buildPlaylist({ starts: [0, 6, 12], duration: 16.5 })
    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
    expect(playlist).toContain('#EXT-X-ENDLIST')
    expect(playlist).toContain('#EXT-X-TARGETDURATION:6')
    const durations = [...playlist.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => Number(m[1]))
    expect(durations).toEqual([6, 6, 4.5])
    expect(playlist).toContain('seg_00002.ts')
  })

  it('stretches the first segment back to 0 when the first keyframe is late', () => {
    const playlist = buildPlaylist({ starts: [0.084, 6.1], duration: 10 })
    const durations = [...playlist.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => Number(m[1]))
    expect(durations).toEqual([6.1, 3.9])
  })
})
