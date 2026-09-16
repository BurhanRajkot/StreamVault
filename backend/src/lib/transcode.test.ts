import { describe, it, expect } from 'bun:test'
import { planPlayback, chooseAudioTrack, type ProbedStream } from './transcode'

const video = (index: number, extra: Partial<ProbedStream> = {}): ProbedStream => ({
  index,
  codec_type: 'video',
  codec_name: 'h264',
  disposition: { default: 1, attached_pic: 0, comment: 0 },
  ...extra,
})

const audio = (index: number, codec: string, language?: string, extra: Partial<ProbedStream> = {}): ProbedStream => ({
  index,
  codec_type: 'audio',
  codec_name: codec,
  channels: 6,
  disposition: { default: 0, attached_pic: 0, comment: 0 },
  tags: language ? { language } : {},
  ...extra,
})

// Stream layouts below are real ffprobe output from files in the shared
// TorBox account (Sept 2026) — none of their release names mention the codec.
describe('planPlayback', () => {
  it('transcodes E-AC3 even when the release name says nothing about audio', () => {
    // Kurukshetra...S01E02.1080p.WEB.h264-EDITH.mkv
    const plan = planPlayback([video(0), audio(1, 'eac3', 'hin', { disposition: { default: 1 } }), audio(2, 'eac3', 'eng')])
    expect(plan.direct).toBe(false)
    expect(plan.audioIndex).toBe(2)
    expect(plan.videoIndex).toBe(0)
  })

  it('picks the English track when a dub comes first', () => {
    // The.Last.of.Us.S01E01.2160p.WEB-DL.DV.HDR10.NewComers.mkv
    const plan = planPlayback([
      video(0, { codec_name: 'hevc' }),
      audio(1, 'ac3', 'rus'),
      audio(2, 'ac3', 'rus'),
      audio(3, 'eac3', 'eng'),
    ])
    expect(plan).toMatchObject({ direct: false, audioIndex: 3 })
  })

  it('skips cover-art video streams', () => {
    const plan = planPlayback([
      video(0, { codec_name: 'mjpeg', disposition: { attached_pic: 1 } }),
      video(1, { codec_name: 'hevc' }),
      audio(2, 'truehd', 'eng'),
    ])
    expect(plan.videoIndex).toBe(1)
  })

  it('plays browser-safe audio directly when it is the first track', () => {
    // The.Shawshank.Redemption.1994.1080p.x264.YIFY.mp4
    expect(planPlayback([video(0), audio(1, 'aac', 'und')]).direct).toBe(true)
  })

  it('remuxes when the English AAC track is not the first audio track', () => {
    const plan = planPlayback([video(0), audio(1, 'aac', 'tur'), audio(2, 'aac', 'eng')])
    expect(plan).toMatchObject({ direct: false, audioIndex: 2 })
  })

  it('plays files without any audio directly', () => {
    expect(planPlayback([video(0)]).direct).toBe(true)
  })
})

describe('chooseAudioTrack', () => {
  it('prefers a browser-safe track within the preferred language', () => {
    // Avengers...Hybrid 1080p Repack BluRay DDP7 1 x264-ZoroSenpai.mkv
    const track = chooseAudioTrack([video(0), audio(1, 'eac3', 'eng'), audio(2, 'aac', 'eng')])
    expect(track?.index).toBe(2)
  })

  it('ignores commentary tracks', () => {
    const track = chooseAudioTrack([
      video(0),
      audio(1, 'aac', 'eng', { tags: { language: 'eng', title: 'Director Commentary' } }),
      audio(2, 'eac3', 'eng'),
    ])
    expect(track?.index).toBe(2)
  })

  it('falls back to the default-flagged track when no preferred language exists', () => {
    const track = chooseAudioTrack([video(0), audio(1, 'ac3', 'spa'), audio(2, 'ac3', 'fre', { disposition: { default: 1 } })])
    expect(track?.index).toBe(2)
  })
})
