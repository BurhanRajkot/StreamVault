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

/**
 * Lossless remuxes: 40-100 Mbit/s video plus TrueHD/DTS-HD audio that always
 * has to be transcoded. Also spelled "BDRemux" / "UHDRemux" — the 37 GB
 * Russian "BDRemux 1080p" was the auto-pick for Dune: Part Two (2026-11-08).
 */
function isRemux(name: string): boolean {
  return /(\b|BD|UHD)REMUX\b/i.test(name)
}

/**
 * Filmed in a cinema or taken off a pre-release copy: CAM, TS/telesync, TC/
 * telecine, screeners. They're often what's cached first for a new film, and
 * the worst picture on offer.
 */
export function isTheatricalRip(name: string): boolean {
  return /\b(HD[ .-]?)?(CAM|TS|TC|TELESYNC|TELECINE)(-?Rip)?\b|\b(DVD|BD)?SCR(EENER)?\b|\bPRE-?DVD(Rip)?\b/i.test(name)
}

/**
 * 0 = name declares audio every browser decodes (so the direct link plays
 * as-is, with instant seeking), 2 = declares audio that needs Real-Debrid's
 * HLS transcode, 1 = doesn't say. YTS/YIFY releases are always AAC, though
 * their names only say "5.1".
 */
function audioRank(name: string): number {
  if (/\bDTS(-?HD|-?X)?\b|\bTrueHD\b|\bAtmos\b|\bE-?AC-?3\b|\bAC-?3\b|\bDD[P+]?(?:\d(?:\.\d)?)?\b/i.test(name)) return 2
  if (/\b(AAC|Opus|MP3)(\d(\.\d)?)?\b/i.test(name) || /\b(YTS|YIFY)\b/i.test(name)) return 0
  return 1
}

/** The name says the audio is something every browser decodes. */
export function declaresBrowserAudio(name: string): boolean {
  return audioRank(name) === 0
}

/** Audio languages a release name may list next to English ("iTA-ENG", "5xRus.Ukr.Eng", "Hindi + English"). */
const OTHER_LANGUAGE_RE =
  /\b(ITA|iTALiAN|FRE|FRENCH|TRUEFRENCH|GER|GERMAN|SPA|SPANISH|ESP|LATINO|RUS|UKR|POL|HIN|Hindi|TAM|Tamil|TEL|Telugu|KOR|JAP|JPN)\b/i

/**
 * Two or more audio languages. Which one comes first — the only one a
 * <video> element plays — is a coin toss: "Dual" releases are often Hindi
 * first (the IMAX WEB-DL "Dual" that topped Sinners' list), "iTA-ENG" ones
 * Italian first (the IMAX BluRay picked next, after "Dual" was handled —
 * both 2026-11-10), and then the English track only plays through
 * Real-Debrid's transcode.
 */
function isMultiAudio(name: string): boolean {
  if (/\b(Dual|MULTi)([ ._-]?Audio)?\b/i.test(name)) return true
  return /(\b|\d)(ENG|English)\b/i.test(name) && OTHER_LANGUAGE_RE.test(name.replace(/(\d)x(?=[A-Z])/gi, '$1 '))
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

/**
 * 10-bit H.264 ("Hi10P", common in anime encodes): no browser decodes it —
 * the picture never comes (or comes out garbled), so the file only plays
 * through Real-Debrid's transcode. 10-bit HEVC and AV1 are fine wherever
 * those codecs are.
 */
function isTenBitAvc(name: string): boolean {
  return assumedVideoCodec(name) === 'avc' && /\b(Hi10P?|10[ .-]?bits?)\b/i.test(name)
}

/**
 * XviD/DivX (MPEG-4 Part 2), usually in an AVI: no browser plays either, and
 * the names say nothing else about the codec, so they'd pass for H.264.
 */
function isLegacyCodec(name: string): boolean {
  return /\b(XviD|DivX)\b|\.avi$/i.test(name)
}

/** True when this browser should be able to decode the release's video and render it with correct colours. */
export function isBrowserPlayable(name: string, support: BrowserVideoSupport): boolean {
  if (isDolbyVisionOnly(name) || isTenBitAvc(name) || isLegacyCodec(name)) return false
  const codec = assumedVideoCodec(name)
  return codec === 'avc' || (codec === 'hevc' && support.hevc) || (codec === 'av1' && support.av1)
}

/**
 * Whether a release is worth resolving in the hope that it plays straight
 * from its file — nothing in its name says it would need Real-Debrid's
 * transcode (a codec this browser can't decode, Dolby/DTS audio, a remux,
 * a second language that may come first). The player spends extra resolves
 * on these in case its first pick needs the transcode — and they'd then be
 * played instead of it, so a cam/telesync never counts: a converted copy of
 * the film beats a direct one filmed in a cinema.
 */
export function isLikelyDirectPlayable(name: string, support: BrowserVideoSupport): boolean {
  return (
    isBrowserPlayable(name, support) &&
    audioRank(name) !== 2 &&
    !isRemux(name) &&
    !isMultiAudio(name) &&
    !isTheatricalRip(name)
  )
}

/**
 * Above this bitrate (kbit/s) a file is heavy to stream into a browser from
 * Real-Debrid, however fast the line measured.
 *
 * A `<video>` playing a plain file keeps only ~10 seconds loaded ahead
 * (Chrome sizes that from the file's bitrate, counting 20 Mbit/s at most),
 * and a Real-Debrid server now and then goes quiet for several seconds — a
 * slow answer on a new connection, a connection that sits (see
 * DebridVideo). The film has to load faster than it plays to get that
 * cushion back before the next one: a 6-10 Mbit/s 1080p encode does so
 * several times over, a 25 Mbit/s one barely. Sol and the other servers
 * stream 1080p at a few Mbit/s, which is why they never stutter.
 */
export const HEAVY_FILE_KBPS = 16_000

export interface RankOptions {
  /**
   * How long the film or episode runs, in seconds — with each release's size
   * it says which files are heavy (HEAVY_FILE_KBPS). Unknown: none is.
   */
  durationS?: number
}

/** Whether a release's file needs more than HEAVY_FILE_KBPS — false when that can't be told. */
export function isHeavyRelease(release: DebridRelease, durationS: number | undefined): boolean {
  if (!durationS || !trustsFileSize(release)) return false
  const kbps = releaseKbps(release, durationS)
  return kbps !== null && kbps > HEAVY_FILE_KBPS
}

/**
 * Whether a release's size is the size of the file that would play. A
 * season pack from apibay gives the whole torrent's (ten episodes' worth);
 * Torrentio gives the matched file's.
 */
function trustsFileSize(release: DebridRelease): boolean {
  return !!release.file_name || (parseInt(release.num_files, 10) || 1) <= 1 || !/\bS\d{1,2}(?!\s*E?\d)|\bSeason\b|\bComplete\b/i.test(release.name)
}

/**
 * Order releases for automatic playback, best first:
 *   decodable by this browser → cached → not a cam/telesync → audio not
 *   declared as Dolby/DTS → 1080p over 4K over 720p → likely English → one
 *   audio language → not a remux → not heavy (HEAVY_FILE_KBPS, when the
 *   running time is known) → audio declared browser-safe → IMAX → seeders →
 *   smaller file (lower bitrate, less buffering).
 *
 * Real-Debrid's HLS transcode can rescue an undecodable file (it always
 * outputs H.264 + AAC), but a jump outside what it has loaded restarts the
 * conversion (~7s, see convertedStreamUrl), while a direct link seeks in
 * ~2s at the original quality. So a release whose name already says it
 * needs the transcode is passed over before resolution is even considered.
 */
export function rankReleasesForPlayback(
  releases: DebridRelease[],
  support: BrowserVideoSupport,
  { durationS }: RankOptions = {}
): DebridRelease[] {
  const key = (r: DebridRelease): number[] => {
    const size = parseInt(r.size, 10)
    return [
      isBrowserPlayable(r.name, support) ? 0 : 1,
      r.cached ? 0 : 1,
      isTheatricalRip(r.name) ? 1 : 0,
      audioRank(r.name) === 2 ? 1 : 0,
      resolutionRank(r.name),
      isLikelyNonEnglishRelease(r.name) ? 1 : 0,
      isMultiAudio(r.name) ? 1 : 0,
      isRemux(r.name) ? 1 : 0,
      isHeavyRelease(r, durationS) ? 1 : 0,
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
// Fitting the release to the connection
// ---------------------------------------------------------------------------

/**
 * The share of a connection a film may need and still play without
 * stalling: the rest is headroom for scenes busier than the file's average,
 * and for a measurement that came out a little high.
 */
const CONNECTION_SHARE = 0.8

/** A release at most this share of the playing one's size counts as lighter: a real step down, not the same encode again. */
const LIGHTER_MAX_SHARE = 0.7

function releaseSize(release: DebridRelease): number {
  const size = parseInt(release.size, 10)
  return Number.isFinite(size) && size > 0 ? size : 0
}

/** What a release needs to play in real time, in kbit/s — null when its size or length isn't known. */
export function releaseKbps(release: DebridRelease, durationS: number): number | null {
  const size = releaseSize(release)
  if (!size || !(durationS > 0)) return null
  return (size * 8) / durationS / 1000
}

/** Plays as it is in this browser, and isn't a cinema recording: worth picking for its size. */
function isLightCandidate(release: DebridRelease, support: BrowserVideoSupport): boolean {
  return isBrowserPlayable(release.name, support) && !isTheatricalRip(release.name)
}

/** Lightest first — a file that plays as it is before one that doesn't, an unknown size last. */
function byWeight(support: BrowserVideoSupport) {
  return (a: DebridRelease, b: DebridRelease): number =>
    Number(isLightCandidate(b, support)) - Number(isLightCandidate(a, support)) ||
    (releaseSize(a) || Number.MAX_SAFE_INTEGER) - (releaseSize(b) || Number.MAX_SAFE_INTEGER)
}

/**
 * Reorder ranked releases (best first, see rankReleasesForPlayback) for a
 * connection of `kbps`: the best one it can carry first.
 *
 * A film that needs 8 Mbit/s on a 2 Mbit/s line doesn't play — it stalls
 * every few seconds — where the 720p encode of it plays through. There is
 * no adaptive stream to fall back on (Real-Debrid's transcode comes in one
 * quality), so the choice is made between releases.
 *
 * Unchanged when the speed or the length isn't known, or the top pick
 * already fits. Otherwise the releases that fit keep their order, in
 * front; the rest follow lightest first.
 */
export function fitReleasesToConnection(
  ranked: DebridRelease[],
  kbps: number | null,
  durationS: number,
  support: BrowserVideoSupport
): DebridRelease[] {
  if (kbps === null || !(kbps > 0) || !(durationS > 0) || ranked.length === 0) return ranked
  const budget = kbps * CONNECTION_SHARE
  const fits = (r: DebridRelease) => {
    const needs = releaseKbps(r, durationS)
    return needs !== null && needs <= budget && isLightCandidate(r, support)
  }
  if (fits(ranked[0])) return ranked
  return [...ranked.filter(fits), ...ranked.filter((r) => !fits(r)).sort(byWeight(support))]
}

/**
 * A release lighter than the one playing, for a film that keeps stalling:
 * the best-ranked one the connection (`kbps`, when the player could tell)
 * can carry — failing that the lightest, or with no speed to go by, the
 * next real step down. Null when there's nothing lighter to offer.
 */
export function lighterRelease(
  ranked: DebridRelease[],
  current: DebridRelease,
  opts: { kbps: number | null; durationS: number; support: BrowserVideoSupport; exclude?: ReadonlySet<string> }
): DebridRelease | null {
  const currentSize = releaseSize(current)
  const pool = ranked.filter(
    (r) =>
      r.info_hash !== current.info_hash &&
      !opts.exclude?.has(r.info_hash) &&
      isLightCandidate(r, opts.support) &&
      releaseSize(r) > 0 &&
      (currentSize === 0 || releaseSize(r) <= currentSize * LIGHTER_MAX_SHARE)
  )
  if (pool.length === 0) return null
  if (opts.kbps === null || !(opts.kbps > 0)) return pool[0]
  const budget = opts.kbps * CONNECTION_SHARE
  const fitting = pool.find((r) => (releaseKbps(r, opts.durationS) ?? Infinity) <= budget)
  return fitting ?? [...pool].sort(byWeight(opts.support))[0]
}

/**
 * What a film that isn't playing smoothly suffers from:
 *   - `stalls`: it keeps stopping to load — the file needs more than the
 *     connection (or, converted, Real-Debrid's converter) delivers;
 *   - `frames`: it plays, but the device can't decode it in time and drops
 *     frames — a 4K or high-bitrate file, or a codec decoded in software.
 */
export type StruggleCause = 'stalls' | 'frames'

/** Releases tried, at most, when moving away from one that doesn't play smoothly. */
const MAX_REPLACEMENTS = 3

/**
 * The releases to move to, best first, from one that isn't playing
 * smoothly — what a viewer would otherwise do by hand from the Quality menu:
 *
 *   - Stalling while Real-Debrid converts it (`converted`): the converter is
 *     the bottleneck, so a release likely to play straight from its file
 *     comes first, whatever its size; a lighter one after that.
 *   - Stalling from the file: a lighter release, the best one the connection
 *     (`kbps`) carries first (see lighterRelease).
 *   - Dropping frames: a lighter release, H.264 first — the codec every
 *     device decodes in hardware.
 *
 * Only releases that play as they are in this browser and aren't cinema
 * recordings; never the playing one or any in `exclude`.
 */
export function replacementReleases(
  ranked: DebridRelease[],
  current: DebridRelease,
  opts: {
    cause: StruggleCause
    converted: boolean
    kbps: number | null
    durationS: number
    support: BrowserVideoSupport
    exclude?: ReadonlySet<string>
  }
): DebridRelease[] {
  const out: DebridRelease[] = []
  const add = (r: DebridRelease | null | undefined) => {
    if (r && out.length < MAX_REPLACEMENTS && !out.some((o) => o.info_hash === r.info_hash)) out.push(r)
  }
  const usable = (r: DebridRelease) =>
    r.info_hash !== current.info_hash && !opts.exclude?.has(r.info_hash) && isLightCandidate(r, opts.support)

  if (opts.cause === 'stalls' && opts.converted) {
    const direct = ranked.filter((r) => usable(r) && isLikelyDirectPlayable(r.name, opts.support))
    const budget = opts.kbps !== null && opts.kbps > 0 ? opts.kbps * CONNECTION_SHARE : null
    const fits = (r: DebridRelease) => budget === null || (releaseKbps(r, opts.durationS) ?? 0) <= budget
    direct.filter(fits).forEach(add)
    direct.filter((r) => !fits(r)).sort(byWeight(opts.support)).forEach(add)
  }

  const exclude = new Set(opts.exclude)
  for (let i = 0; i < MAX_REPLACEMENTS; i++) {
    const pool = opts.cause === 'frames' ? [...ranked].sort(byCodecEase) : ranked
    const lighter = lighterRelease(pool, current, {
      kbps: opts.cause === 'frames' ? null : opts.kbps,
      durationS: opts.durationS,
      support: opts.support,
      exclude,
    })
    if (!lighter) break
    add(lighter)
    exclude.add(lighter.info_hash)
  }
  return out
}

/** H.264 before anything a device may have to decode in software; otherwise unchanged (the sort is stable). */
function byCodecEase(a: DebridRelease, b: DebridRelease): number {
  return Number(assumedVideoCodec(a.name) !== 'avc') - Number(assumedVideoCodec(b.name) !== 'avc')
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
 *
 * `nearUrl` is the same file on the download server nearest the viewer (see
 * lib/debridHost): played first, with the link as Real-Debrid gave it right
 * behind, should that server let the viewer down.
 */
export function planPlaybackModes(
  playback: DebridReadyPlayback,
  support: BrowserVideoSupport,
  nearUrl?: string | null
): PlaybackMode[] {
  const issued: PlaybackMode = { kind: 'direct', url: playback.directUrl, label: 'Direct' }
  const direct: PlaybackMode[] =
    nearUrl && nearUrl !== playback.directUrl ? [{ kind: 'direct', url: nearUrl, label: 'Direct' }, issued] : [issued]
  const hls: PlaybackMode[] = playback.hls ? [{ kind: 'hls', url: playback.hls, label: 'RD stream' }] : []

  const media = playback.media
  if (!media) return [...direct, ...hls]

  const firstAudio = media.audioTracks[0]
  const directPlayable =
    media.videoCodec !== null &&
    canDecodeVideoCodec(media.videoCodec, support) &&
    (!firstAudio || (firstAudio.codec !== null && BROWSER_AUDIO_CODECS.has(firstAudio.codec.toLowerCase()))) &&
    (!firstAudio || media.selectedAudio === null || media.selectedAudio === firstAudio.id)

  // Direct stays as the last resort even when it's expected to fail: picture
  // without sound beats nothing if Real-Debrid's transcode is down.
  return directPlayable ? [...direct, ...hls] : [...hls, ...direct]
}

/**
 * Where the seek bar's preview frames come from: the file's direct link,
 * whenever this browser decodes its *video* — the audio doesn't matter for a
 * silent thumbnail, so a file that plays through the transcode only for its
 * Dolby/DTS sound still gets previews. Null when the picture itself can't be
 * decoded here (the transcode, which only converts forward, can't serve
 * frames from elsewhere in the film on demand).
 */
export function previewStreamUrl(playback: DebridReadyPlayback, support: BrowserVideoSupport): string | null {
  const codec = playback.media?.videoCodec
  if (codec === undefined || codec === null) return playback.directUrl
  return canDecodeVideoCodec(codec, support) ? playback.directUrl : null
}

// ---------------------------------------------------------------------------
// Seeking in Real-Debrid's converted stream
// ---------------------------------------------------------------------------

/**
 * Real-Debrid's converted stream, starting `at` seconds into the file.
 *
 * Its converter only runs forward, at about 3× real time, so on its own a
 * jump past what it has converted never arrives. `?t=<seconds>` on the
 * playlist (undocumented, found 2026-10-18) restarts it there instead: the
 * playlist then covers the rest of the file, its segments numbered and timed
 * from 0. The first segment takes ~7s; the rest ~1.5s each.
 */
export function convertedStreamUrl(url: string, at: number): string {
  const start = Math.floor(at)
  if (start <= 0) return url
  return `${url}${url.includes('?') ? '&' : '?'}t=${start}`
}

/** How far past what's loaded a jump can land and still be left to the conversion already running. */
export const CONVERTED_SEEK_AHEAD_S = 30

export type ConvertedSeek = { kind: 'local'; time: number } | { kind: 'restart'; at: number }

/**
 * How to jump to `target` (seconds into the file) in a converted stream
 * that starts `offset` seconds in. `loadedUntil` is where the loaded media
 * ends, in the element's own time — null before the stream has loaded.
 *
 * Within what's loaded, or just past it (the converter runs ahead of
 * playback), it's an ordinary seek. Anywhere else — behind the stream's
 * start, or far ahead — the conversion restarts there: a few seconds,
 * where waiting for it to get there could take minutes.
 */
export function planConvertedSeek(target: number, offset: number, loadedUntil: number | null): ConvertedSeek {
  const local = target - offset
  if (loadedUntil !== null && local >= 0 && local <= loadedUntil + CONVERTED_SEEK_AHEAD_S) {
    return { kind: 'local', time: local }
  }
  return { kind: 'restart', at: Math.max(0, Math.floor(target)) }
}
