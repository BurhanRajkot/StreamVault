/**
 * Which debrid release a *browser* can actually play, and play smoothly —
 * and, once Real-Debrid has resolved one, how to play it.
 *
 * Debrid addons like AIOStreams hand streams to native players (mpv,
 * ExoPlayer, VLC) that decode anything, so they can rank purely on quality.
 * A `<video>` element can't: desktop Chrome/Firefox mostly have no HEVC
 * decoder, Dolby Vision without an HDR10 base layer renders green/purple,
 * and a 4K WEB-DL at 20-40 Mbit/s stalls on an ordinary connection. Ranking
 * "4K first" meant the auto-picked release for nearly every series and
 * documentary was a 2160p H.265 file that either never started or buffered
 * constantly.
 */

import {
  parseTorrentQuality,
  isImaxRelease,
  isLikelyNonEnglishRelease,
  type DebridRelease,
  type DebridReadyPlayback,
} from './debridApi'

export type ReleaseVideoCodec = 'avc' | 'hevc' | 'av1'

export interface BrowserVideoSupport {
  hevc: boolean
  av1: boolean
}

/** The video codec a release name declares, or null when it doesn't say. */
export function parseVideoCodec(name: string): ReleaseVideoCodec | null {
  if (/\b([xh][ .]?265|hevc)\b/i.test(name)) return 'hevc'
  if (/\bav1\b/i.test(name)) return 'av1'
  if (/\b([xh][ .]?264|avc)\b/i.test(name)) return 'avc'
  return null
}

/**
 * The codec to assume for a release: what its name declares, otherwise HEVC
 * for 4K (practically every 2160p release is) and H.264 for everything else.
 */
export function assumedVideoCodec(name: string): ReleaseVideoCodec {
  return parseVideoCodec(name) ?? (parseTorrentQuality(name) === '4K' ? 'hevc' : 'avc')
}

/**
 * Dolby Vision with no HDR10 base layer (profile 5, the norm for streaming-
 * service WEB-DLs tagged just "DV"). Browsers ignore the DV metadata, so the
 * picture comes out with a green/purple cast. "DV HDR10" hybrids are fine.
 */
export function isDolbyVisionOnly(name: string): boolean {
  return /\b(DV|DoVi|Dolby[ ._-]?Vision)\b/i.test(name) && !/\bHDR/i.test(name)
}

/** Lossless remuxes: 40-100 Mbit/s video plus TrueHD/DTS-HD audio that always has to be transcoded. */
function isRemux(name: string): boolean {
  return /\bREMUX\b/i.test(name)
}

/**
 * 0 = name declares audio every browser decodes (so the direct link plays
 * as-is, with instant seeking), 2 = declares audio that needs Real-Debrid's
 * HLS transcode, 1 = doesn't say.
 */
function audioRank(name: string): number {
  if (/\bDTS(-?HD|-?X)?\b|\bTrueHD\b|\bAtmos\b|\bE-?AC-?3\b|\bAC-?3\b|\bDD[P+]?(?:\d(?:\.\d)?)?\b/i.test(name)) return 2
  if (/\b(AAC|Opus|MP3)(\d(\.\d)?)?\b/i.test(name)) return 0
  return 1
}

/**
 * Preferred resolution for automatic playback. 1080p first: it's what every
 * browser decodes in H.264 at a bitrate most connections sustain. 4K stays
 * available in the release picker but is never the silent default.
 */
function resolutionRank(name: string): number {
  switch (parseTorrentQuality(name)) {
    case '1080p': return 0
    case '4K': return 1
    case '720p': return 2
    default: return 3
  }
}

let cachedSupport: BrowserVideoSupport | null = null

/** Probe which non-H.264 codecs this browser can decode (via MSE, which is what hls.js needs too). */
export function detectBrowserVideoSupport(): BrowserVideoSupport {
  if (cachedSupport) return cachedSupport
  const canPlay = (type: string) => {
    try {
      if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type)) return true
      if (typeof document !== 'undefined') return document.createElement('video').canPlayType(type) === 'probably'
    } catch {
      // Unsupported API — treat as no support
    }
    return false
  }
  cachedSupport = {
    hevc: canPlay('video/mp4; codecs="hvc1.1.6.L150.B0"') || canPlay('video/mp4; codecs="hev1.1.6.L150.B0"'),
    av1: canPlay('video/mp4; codecs="av01.0.08M.08"'),
  }
  return cachedSupport
}

/** True when this browser should be able to decode the release's video and render it with correct colours. */
export function isBrowserPlayable(name: string, support: BrowserVideoSupport): boolean {
  if (isDolbyVisionOnly(name)) return false
  const codec = assumedVideoCodec(name)
  return codec === 'avc' || (codec === 'hevc' && support.hevc) || (codec === 'av1' && support.av1)
}

/**
 * Order releases for automatic playback, best first:
 *   decodable by this browser → cached → audio not declared as
 *   Dolby/DTS → 1080p over 4K over 720p → likely English → not a remux →
 *   audio declared browser-safe → IMAX → seeders → smaller file (lower
 *   bitrate, less buffering).
 *
 * Real-Debrid's HLS transcode can rescue an undecodable file (it always
 * outputs H.264 + AAC), but its seeking is unreliable — a jump ahead takes
 * 20s or never arrives (measured 2026-10-05) — while a direct link seeks in
 * ~2s. So a release whose name already says it needs the transcode is
 * passed over before resolution is even considered.
 */
export function rankReleasesForPlayback(
  releases: DebridRelease[],
  support: BrowserVideoSupport
): DebridRelease[] {
  const key = (r: DebridRelease): number[] => {
    const size = parseInt(r.size, 10)
    return [
      isBrowserPlayable(r.name, support) ? 0 : 1,
      r.cached ? 0 : 1,
      audioRank(r.name) === 2 ? 1 : 0,
      resolutionRank(r.name),
      isLikelyNonEnglishRelease(r.name) ? 1 : 0,
      isRemux(r.name) ? 1 : 0,
      audioRank(r.name),
      isImaxRelease(r.name) ? 0 : 1,
      -(parseInt(r.seeders, 10) || 0),
      size > 0 ? size : Number.MAX_SAFE_INTEGER,
    ]
  }
  const keys = new Map(releases.map((r) => [r, key(r)]))
  return [...releases].sort((a, b) => {
    const ka = keys.get(a) ?? []
    const kb = keys.get(b) ?? []
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i]
    }
    return 0
  })
}

// ---------------------------------------------------------------------------
// Playing a resolved file
// ---------------------------------------------------------------------------

/** Audio codecs (Real-Debrid/ffprobe names) every mainstream browser decodes. */
const BROWSER_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

/** Whether this browser decodes a video codec, by Real-Debrid/ffprobe name. */
export function canDecodeVideoCodec(codec: string, support: BrowserVideoSupport): boolean {
  switch (codec.toLowerCase()) {
    case 'h264':
    case 'vp8':
    case 'vp9':
      return true
    case 'hevc':
    case 'h265':
      return support.hevc
    case 'av1':
      return support.av1
    default:
      return false
  }
}

export interface PlaybackMode {
  kind: 'direct' | 'hls'
  url: string
  /** Shown in the player so it's clear when Real-Debrid is converting the stream. */
  label: 'Direct' | 'RD stream'
}

/**
 * The ways to play one resolved file, best first. The player works down the
 * list when one fails (element error, no picture, no sound, nothing loaded).
 *
 * Direct comes first when Real-Debrid's media info says the browser can
 * decode the video and the first audio track (the one a <video> element
 * plays) — and that track is the preferred-language one. Otherwise
 * Real-Debrid's HLS transcode goes first. With no media info, direct is
 * simply tried first.
 */
export function planPlaybackModes(playback: DebridReadyPlayback, support: BrowserVideoSupport): PlaybackMode[] {
  const direct: PlaybackMode = { kind: 'direct', url: playback.directUrl, label: 'Direct' }
  const hls: PlaybackMode[] = playback.hls ? [{ kind: 'hls', url: playback.hls, label: 'RD stream' }] : []

  const media = playback.media
  if (!media) return [direct, ...hls]

  const firstAudio = media.audioTracks[0]
  const directPlayable =
    media.videoCodec !== null &&
    canDecodeVideoCodec(media.videoCodec, support) &&
    (!firstAudio || (firstAudio.codec !== null && BROWSER_AUDIO_CODECS.has(firstAudio.codec.toLowerCase()))) &&
    (!firstAudio || media.selectedAudio === null || media.selectedAudio === firstAudio.id)

  // Direct stays as the last resort even when it's expected to fail: picture
  // without sound beats nothing if Real-Debrid's transcode is down.
  return directPlayable ? [direct, ...hls] : [...hls, direct]
}
