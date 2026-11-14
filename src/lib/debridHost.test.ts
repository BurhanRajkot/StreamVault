import { describe, it, expect } from 'bun:test'
import { chooseEdge, edgeDownloadUrl, fullDownloadId, isRealDebridDownloadUrl, nearestDirectUrl } from './debridHost'
import type { DebridReadyPlayback } from './debridApi'

// The shapes of real links (2026-11-10): the main data centre's drop the host
// suffix from the id in the path; a regional server's keep it.
const MAIN = 'https://44-4.download.real-debrid.com/d/3ZCYELW6PS42W/Sinners.2025.1080p.TeleSync.X264.COLLECTiVE.mp4'
const HLS = 'https://29.stream.real-debrid.com/t/3ZCYELW6PS42W44/eng1/none/aac/full.m3u8'
const REGIONAL = 'https://mum1-4.download.real-debrid.com/d/BQTVHNM3GNSPG22/Some%20Movie%20(2025).mkv'

const playback = (overrides: Partial<DebridReadyPlayback> = {}): DebridReadyPlayback => ({
  status: 'ready',
  torrentId: 'T',
  fileId: 1,
  fileName: 'Sinners.2025.1080p.TeleSync.X264.COLLECTiVE.mp4',
  fileSize: 4_296_493_713,
  mimeType: 'video/mp4',
  directUrl: MAIN,
  hls: HLS,
  media: null,
  ...overrides,
})

describe('isRealDebridDownloadUrl', () => {
  it('accepts download links only', () => {
    expect(isRealDebridDownloadUrl(MAIN)).toBe(true)
    expect(isRealDebridDownloadUrl(REGIONAL)).toBe(true)
    expect(isRealDebridDownloadUrl(HLS)).toBe(false)
    expect(isRealDebridDownloadUrl('https://media.e2e.test/d/X/clip.webm')).toBe(false)
    expect(isRealDebridDownloadUrl('not a url')).toBe(false)
  })
})

describe('fullDownloadId', () => {
  it("takes the backend's id", () => {
    expect(fullDownloadId(playback({ downloadId: '3ZCYELW6PS42W44' }))).toBe('3ZCYELW6PS42W44')
  })
  it('falls back to a regional link, whose path has the full id', () => {
    expect(fullDownloadId(playback({ directUrl: REGIONAL, hls: null }))).toBe('BQTVHNM3GNSPG22')
  })
  it('falls back to the transcode link when it extends the id in the download link', () => {
    expect(fullDownloadId(playback())).toBe('3ZCYELW6PS42W44')
    expect(fullDownloadId(playback({ hls: 'https://29.stream.real-debrid.com/t/OTHERID000000044/eng1/none/aac/full.m3u8' }))).toBeNull()
    expect(fullDownloadId(playback({ hls: null }))).toBeNull()
  })
})

describe('edgeDownloadUrl', () => {
  it('moves the link to the regional server, with the full id and the same file name', () => {
    expect(edgeDownloadUrl(MAIN, '3ZCYELW6PS42W44', 'mum1')).toBe(
      'https://mum1-4.download.real-debrid.com/d/3ZCYELW6PS42W44/Sinners.2025.1080p.TeleSync.X264.COLLECTiVE.mp4'
    )
  })
  it('keeps an encoded file name as it is', () => {
    expect(edgeDownloadUrl(REGIONAL, 'BQTVHNM3GNSPG22', 'sgp1')).toBe(
      'https://sgp1-4.download.real-debrid.com/d/BQTVHNM3GNSPG22/Some%20Movie%20(2025).mkv'
    )
  })
  it("uses the server's dual-stack name when the link had one", () => {
    expect(edgeDownloadUrl('https://44.download.real-debrid.com/d/ABC/f.mkv', 'ABC44', 'lax1')).toBe(
      'https://lax1.download.real-debrid.com/d/ABC44/f.mkv'
    )
  })
  it('leaves anything but a download link alone', () => {
    expect(edgeDownloadUrl(HLS, 'X', 'mum1')).toBeNull()
  })
})

describe('chooseEdge', () => {
  it('picks a regional server that answers much faster than the main data centre', () => {
    // Measured from India, 2026-11-10
    expect(chooseEdge(595, { mum1: 59, sgp1: 298, rbx: 564 })).toBe('mum1')
  })
  it('keeps the main data centre when nothing is clearly faster', () => {
    expect(chooseEdge(60, { rbx: 55, tlv1: 90 })).toBeNull()
    expect(chooseEdge(300, { mum1: 220 })).toBeNull() // faster, but not by enough
  })
  it('uses the fastest regional server when the main one never answered', () => {
    expect(chooseEdge(Infinity, { mum1: 80, sgp1: 40 })).toBe('sgp1')
  })
  it('has no answer when nothing answered', () => {
    expect(chooseEdge(Infinity, {})).toBeNull()
    expect(chooseEdge(500, { mum1: Infinity })).toBeNull()
  })
})

describe('nearestDirectUrl', () => {
  it('is the link on the regional server, or null when there is none to use', () => {
    expect(nearestDirectUrl(playback({ downloadId: '3ZCYELW6PS42W44' }), 'mum1')).toBe(
      'https://mum1-4.download.real-debrid.com/d/3ZCYELW6PS42W44/Sinners.2025.1080p.TeleSync.X264.COLLECTiVE.mp4'
    )
    expect(nearestDirectUrl(playback(), null)).toBeNull()
    expect(nearestDirectUrl(playback(), undefined)).toBeNull()
    expect(nearestDirectUrl(playback({ directUrl: 'https://media.e2e.test/clip.webm', hls: null }), 'mum1')).toBeNull()
  })
})
