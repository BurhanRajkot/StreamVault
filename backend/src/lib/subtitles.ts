/**
 * Subtitles for the Premium player — from OpenSubtitles, picked to fit the
 * file that's actually playing.
 *
 * Sources (measured 2026-11-11):
 *   - OpenSubtitles' legacy REST search (rest.opensubtitles.org). No key, but
 *     wants a User-Agent. One language at a time it returns everything —
 *     61 English subtitles for Inception, 42 for a Game of Thrones episode —
 *     with what's needed to rank them: download counts, the release each was
 *     made for, its last cue, and `SubTSGroup`, OpenSubtitles' own grouping
 *     of subtitles whose timings match. Without a language it sweeps them
 *     all, capped at 100 results.
 *   - Stremio's OpenSubtitles addon (opensubtitles-v3.strem.io), as a
 *     fallback. It lists only one subtitle per timing group and language —
 *     for Inception's English, only CAM/TS rips — so it can't be the main
 *     source.
 *   - Files come from Stremio's mirror (subs5.strem.io) by OpenSubtitles file
 *     id, converted to UTF-8, with no download quota — unlike
 *     OpenSubtitles' own download links.
 *
 * Real-Debrid's own media info lists a file's embedded subtitle tracks, but
 * offers no way to fetch one as text: filling the transcode's {subtitles}
 * slot can only burn it into the converted stream.
 *
 * Sync: a title search knows only release names, and a subtitle timed to
 * another cut, intro or frame rate shows the wrong lines. So the playing
 * file's OpenSubtitles fingerprint (its size and its first and last 64 KB —
 * the hash VLC, Kodi and Stremio use) is read too, and subtitles people
 * matched to that very file come first. Failing that, subtitles timed to a
 * different frame rate than most (25 fps PAL against 23.976 fps film drifts
 * ~4%, minutes by the end) are pushed down.
 */

import * as cache from '../services/cache'
import { logger } from './logger'

const OS_REST_BASE = process.env.OPENSUBTITLES_REST_URL || 'https://rest.opensubtitles.org'
const OS_ADDON_BASE = process.env.OPENSUBTITLES_ADDON_URL || 'https://opensubtitles-v3.strem.io'
const SUBTITLE_FILE_BASE =
  process.env.SUBTITLE_FILE_URL || 'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/'

/** The legacy API refuses requests without a User-Agent it knows; this one is OpenSubtitles' public test agent. */
function userAgent(): string {
  return process.env.OPENSUBTITLES_USER_AGENT || 'TemporaryUserAgent'
}

const SEARCH_TIMEOUT_MS = 8000
const FILE_TIMEOUT_MS = 15_000
/** Reading a file's two fingerprint chunks; past this the subtitles go without. */
const FINGERPRINT_TIMEOUT_MS = 4000
/** The fingerprint reads this much from each end of the file. */
const FINGERPRINT_CHUNK = 65_536
/** A real subtitle file is 30-200 KB; anything this big is something else. */
const MAX_FILE_BYTES = 3 * 1024 * 1024
/** Versions offered per language. */
const MAX_OPTIONS_PER_LANGUAGE = 6
/** Languages searched in depth per request (English always among them). */
const MAX_DEEP_LANGUAGES = 3

export const SUBTITLE_FILE_ID_RE = /^\d{1,12}$/
const LANGUAGE_CODE_RE = /^[a-z]{3}$/
/**
 * A Real-Debrid download link — the only address a fingerprint is read from.
 * Anchored, with no wildcards, so nothing else can pass for one.
 */
const DEBRID_DOWNLOAD_LINK_RE =
  /^https:\/\/[a-z0-9-]{1,30}\.download\.real-debrid\.com\/d\/[A-Za-z0-9]{6,32}\/[A-Za-z0-9\-._~%!$&'()*+,;=:@]{1,500}$/
const FINGERPRINT_HASH_RE = /^[0-9a-f]{16}$/
const FINGERPRINT_SIZE_RE = /^\d{6,15}$/

const PLAYABLE_FORMATS = new Set(['srt', 'vtt', 'ass', 'ssa'])

// ---------------------------------------------------------------------------
// Languages — OpenSubtitles' own codes (ISO 639-2/B plus a few of its own)
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  afr: 'Afrikaans', alb: 'Albanian', ara: 'Arabic', arm: 'Armenian', aze: 'Azerbaijani', baq: 'Basque',
  bel: 'Belarusian', ben: 'Bengali', bos: 'Bosnian', bul: 'Bulgarian', bur: 'Burmese', cat: 'Catalan',
  chi: 'Chinese (Simplified)', zht: 'Chinese (Traditional)', zhe: 'Chinese (Bilingual)', hrv: 'Croatian',
  cze: 'Czech', dan: 'Danish', dut: 'Dutch', eng: 'English', epo: 'Esperanto', est: 'Estonian',
  fin: 'Finnish', fre: 'French', geo: 'Georgian', ger: 'German', glg: 'Galician', gre: 'Greek',
  heb: 'Hebrew', hin: 'Hindi', hun: 'Hungarian', ice: 'Icelandic', ind: 'Indonesian', ita: 'Italian',
  jpn: 'Japanese', kan: 'Kannada', kaz: 'Kazakh', khm: 'Khmer', kor: 'Korean', kur: 'Kurdish',
  lav: 'Latvian', lit: 'Lithuanian', mac: 'Macedonian', mal: 'Malayalam', mar: 'Marathi', may: 'Malay',
  mne: 'Montenegrin', mon: 'Mongolian', nep: 'Nepali', nor: 'Norwegian', pan: 'Punjabi', per: 'Persian',
  pol: 'Polish', por: 'Portuguese', pob: 'Portuguese (Brazil)', rum: 'Romanian', rus: 'Russian',
  scc: 'Serbian', sin: 'Sinhala', slo: 'Slovak', slv: 'Slovenian', spa: 'Spanish', spl: 'Spanish (Latin America)',
  spn: 'Spanish (Spain)', swa: 'Swahili', swe: 'Swedish', tam: 'Tamil', tel: 'Telugu', tgl: 'Tagalog',
  tha: 'Thai', tur: 'Turkish', ukr: 'Ukrainian', urd: 'Urdu', vie: 'Vietnamese', wel: 'Welsh',
}

/** The addon speaks ISO 639-2/T where OpenSubtitles uses /B (and its own Serbian code). */
const ADDON_LANGUAGE_CODES: Record<string, string> = {
  ell: 'gre', ron: 'rum', srp: 'scc', nld: 'dut', deu: 'ger', fra: 'fre', ces: 'cze', zho: 'chi',
  fas: 'per', sqi: 'alb', hye: 'arm', eus: 'baq', mya: 'bur', kat: 'geo', isl: 'ice', mkd: 'mac',
  msa: 'may', slk: 'slo', cym: 'wel',
}

export function languageName(code: string, given?: string): string {
  return LANGUAGE_NAMES[code] ?? (given?.trim() || code.toUpperCase())
}

// ---------------------------------------------------------------------------
// Candidates — one subtitle file, as either source describes it
// ---------------------------------------------------------------------------

export interface SubtitleCandidate {
  /** OpenSubtitles file id — what the mirror serves the file by. */
  id: string
  /** OpenSubtitles language code, e.g. "eng". */
  lang: string
  langName?: string
  /** The release the subtitle was made for. */
  release: string
  format: string
  downloads: number
  hearingImpaired: boolean
  trusted: boolean
  bad: boolean
  rating: number
  /** Parts the subtitle is split into (2 for an old two-CD rip — half a film each). */
  cds: number
  /** Only the lines in another language (signs, foreign dialogue). */
  foreignPartsOnly: boolean
  machineTranslated: boolean
  /** OpenSubtitles' timing group: subtitles in one group share their timings. */
  timingGroup: string | null
  /** When the last line appears, in seconds. */
  lastCue: number | null
  releaseGroup: string
  /** BluRay, WEBRip, HDTV, Cam, ... as OpenSubtitles recorded it. */
  source: string
  /** Frame rate of the video it was timed to; null when unknown. */
  fps: number | null
  /** OpenSubtitles matched it to the playing file's fingerprint: timed to this very file. */
  hashMatch: boolean
  /** The title it's for (legacy search only): IMDb numbers without "tt" or leading zeros. */
  imdb: string | null
  /** For an episode: its show, season and number. */
  parentImdb: string | null
  season: number | null
  episode: number | null
}

/** One record of the legacy REST search (the fields used here). */
interface OsRestResult {
  MatchedBy?: string
  IDMovieImdb?: string | number
  SeriesIMDBParent?: string | number
  SeriesSeason?: string | number
  SeriesEpisode?: string | number
  MovieFPS?: string | number
  IDSubtitleFile?: string
  SubLanguageID?: string
  LanguageName?: string
  MovieReleaseName?: string
  SubFileName?: string
  SubFormat?: string
  SubDownloadsCnt?: string | number
  SubHearingImpaired?: string | number
  SubFromTrusted?: string | number
  SubBad?: string | number
  SubRating?: string | number
  SubSumCD?: string | number
  SubForeignPartsOnly?: string | number
  SubAutoTranslation?: string | number
  SubTSGroup?: string | number | null
  SubLastTS?: string
  InfoReleaseGroup?: string
  InfoFormat?: string
}

/** One subtitle as the Stremio addon lists it. */
interface AddonSubtitle {
  id?: string
  url?: string
  lang?: string
  g?: string | number
  subtitleFileName?: string
  movieReleaseName?: string
  releaseGroup?: string
  releaseFormat?: string
}

const flag = (v: unknown) => String(v) === '1'
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Some uploads list several releases, one per line — the first names it. */
const firstLine = (s: string) => s.trim().split(/\s*[\r\n]+\s*/)[0] ?? ''

/** "23.976" → 23.976; "0.000" (unknown) → null. */
function frameRate(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 10 && n <= 120 ? n : null
}

/** An IMDb number as OpenSubtitles compares them: "tt0944947", "944947" or 944947 → "944947". */
export function imdbNumber(v: unknown): string | null {
  const n = Number(String(v ?? '').replace(/^tt/i, ''))
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null
}

function wholeNumberOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** "02:20:39" → 8439 */
export function parseClock(value: string | undefined): number | null {
  const m = value?.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

export function fromRestResult(r: OsRestResult): SubtitleCandidate | null {
  const id = String(r.IDSubtitleFile ?? '')
  const lang = String(r.SubLanguageID ?? '').toLowerCase()
  if (!SUBTITLE_FILE_ID_RE.test(id) || !LANGUAGE_CODE_RE.test(lang)) return null
  return {
    id,
    lang,
    langName: r.LanguageName,
    release: firstLine(r.MovieReleaseName || r.SubFileName || ''),
    format: String(r.SubFormat ?? '').toLowerCase(),
    downloads: num(r.SubDownloadsCnt),
    hearingImpaired: flag(r.SubHearingImpaired),
    trusted: flag(r.SubFromTrusted),
    bad: num(r.SubBad) > 0,
    rating: num(r.SubRating),
    cds: num(r.SubSumCD) || 1,
    foreignPartsOnly: flag(r.SubForeignPartsOnly),
    machineTranslated: flag(r.SubAutoTranslation),
    timingGroup: r.SubTSGroup == null || r.SubTSGroup === '' ? null : String(r.SubTSGroup),
    lastCue: parseClock(r.SubLastTS),
    releaseGroup: (r.InfoReleaseGroup || '').trim(),
    source: (r.InfoFormat || '').trim(),
    fps: frameRate(r.MovieFPS),
    hashMatch: r.MatchedBy === 'moviehash',
    imdb: imdbNumber(r.IDMovieImdb),
    parentImdb: imdbNumber(r.SeriesIMDBParent),
    season: wholeNumberOrNull(r.SeriesSeason),
    episode: wholeNumberOrNull(r.SeriesEpisode),
  }
}

export function fromAddonSubtitle(s: AddonSubtitle): SubtitleCandidate | null {
  const id = s.url?.match(/\/file\/(\d{1,12})(?:$|[/?#])/)?.[1]
  const raw = String(s.lang ?? '').toLowerCase()
  const lang = ADDON_LANGUAGE_CODES[raw] ?? raw
  if (!id || !LANGUAGE_CODE_RE.test(lang)) return null
  const fileName = s.subtitleFileName ?? ''
  const ext = fileName.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase()
  return {
    id,
    lang,
    release: firstLine(s.movieReleaseName || fileName),
    format: ext && PLAYABLE_FORMATS.has(ext) ? ext : 'srt',
    downloads: 0,
    hearingImpaired: /(^|[._\s-])(HI|SDH)([._\s-]|$)/i.test(fileName),
    trusted: false,
    bad: false,
    rating: 0,
    cds: /\bCD\d\b/i.test(fileName) ? 2 : 1,
    foreignPartsOnly: /\bforced\b/i.test(fileName),
    machineTranslated: false,
    timingGroup: s.g == null || s.g === '' ? null : String(s.g),
    lastCue: null,
    releaseGroup: (s.releaseGroup || '').trim(),
    source: (s.releaseFormat || '').trim(),
    fps: null,
    hashMatch: false,
    imdb: null,
    parentImdb: null,
    season: null,
    episode: null,
  }
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

type SourceKind = 'cam' | 'bluray' | 'web' | 'hdtv' | 'dvd'

/** What kind of rip a release name (or OpenSubtitles' format field) describes. */
export function sourceKind(name: string): SourceKind | null {
  // An MPEG-TS file's ".ts" isn't a TeleSync.
  const text = name.replace(/\.(mkv|mp4|m4v|avi|webm|ts|m2ts)$/i, '')
  if (/\b(cam|hdcam|camrip|ts|hdts|telesync|tc|telecine|scr|screener|dvdscr)\b/i.test(text)) return 'cam'
  if (/\b(blu-?ray|bdrip|brrip|bdremux|remux|bd(?:25|50)?)\b/i.test(text)) return 'bluray'
  if (/\b(web-?dl|web-?rip|web|amzn|nf|dsnp|hmax|atvp|hulu|itunes|pcok|pmtp)\b/i.test(text)) return 'web'
  if (/\b(hdtv|pdtv|tvrip|dsr)\b/i.test(text)) return 'hdtv'
  if (/\b(dvd|dvdrip|dvd5|dvd9)\b/i.test(text)) return 'dvd'
  return null
}

/** The scene/P2P group at the end of a release or file name: "…x264-SPARKS.mkv" → "sparks". */
export function releaseGroupOf(name: string): string | null {
  const base = name.replace(/\.(mkv|mp4|m4v|avi|webm|ts|srt|sub|ass|ssa|vtt)$/i, '').replace(/\s*\[[^\]]*\]\s*$/, '')
  const dashed = base.match(/-([a-z0-9]{2,20})$/i)?.[1]
  if (dashed) return dashed.toLowerCase()
  const known = base.match(/[.\s[(](YIFY|YTS|RARBG|PSA|QxR|Tigole|GalaxyRG|TGx|EZTVx?|MeGusta)\b/i)?.[1]
  return known ? known.toLowerCase() : null
}

export interface PlayingFile {
  /** The file's name, e.g. "Inception.2010.1080p.BluRay.x264-SPARKS.mkv". */
  name?: string
  /** Its length in seconds. */
  duration?: number | null
  /** Its Real-Debrid download link — read for the fingerprint. */
  link?: string
  /** Its size in bytes, when known: both fingerprint chunks are then read at once. */
  size?: number | null
}

/** "Inception.2010.1080p.BluRay.x264-SPARKS.mkv" and "Inception 2010 1080p BluRay x264-SPARKS" → the same. */
export function releaseKey(name: string): string {
  return name
    .trim()
    .replace(/\.(mkv|mp4|m4v|avi|webm|ts|m2ts)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

/** The same frame rate, give or take how it was written (23.976 is often 23.98). */
const sameFps = (a: number, b: number) => Math.abs(a - b) < 0.01

const isCam = (c: SubtitleCandidate) => sourceKind(`${c.source} ${c.release}`) === 'cam'

/**
 * The frame rate most of these subtitles were timed to, weighted by
 * downloads — when it's a clear majority (60%), else null.
 */
export function commonFrameRate(candidates: SubtitleCandidate[]): number | null {
  const clusters: { fps: number; weight: number }[] = []
  let total = 0
  for (const c of candidates) {
    if (c.fps === null || isCam(c)) continue
    const fps = c.fps
    const weight = 1 + Math.log10(c.downloads + 1)
    total += weight
    const cluster = clusters.find((k) => sameFps(k.fps, fps))
    if (cluster) cluster.weight += weight
    else clusters.push({ fps, weight })
  }
  const best = clusters.sort((a, b) => b.weight - a.weight)[0]
  return best && best.weight >= total * 0.6 ? best.fps : null
}

/** What a subtitle is scored against: the playing file as far as it's known. */
export interface FileTraits {
  group: string | null
  source: SourceKind | null
  duration: number | null
  /** releaseKey of its name. */
  key?: string | null
  fps?: number | null
  /** `fps` came from subtitles matched to this file (sure), not from what most subtitles say. */
  fpsKnown?: boolean
}

/** What the player offers: languages, each with its versions, best first. */
export interface SubtitleOption {
  id: string
  /** The release the subtitle was made for. */
  release: string
  /** Made for the deaf and hard of hearing — sound cues like "[door slams]". */
  hearingImpaired: boolean
  /** Matched to the playing file's fingerprint — timed to this very file. Absent when not. */
  matched?: boolean
}

export interface SubtitleLanguage {
  code: string
  name: string
  options: SubtitleOption[]
}

/** Not a full subtitle for the whole of this file — never offered. */
function unusable(c: SubtitleCandidate, duration: number | null): boolean {
  if (!PLAYABLE_FORMATS.has(c.format)) return true
  if (c.cds > 1 || c.foreignPartsOnly || c.machineTranslated) return true
  // Ends before half the film: a part, a trailer's or an extra's, or broken.
  if (duration && c.lastCue !== null && c.lastCue < duration * 0.5) return true
  return false
}

/**
 * The timing most of a language's subtitles share, weighted by how often
 * each was downloaded — among those timed to the file's frame rate, if known.
 */
function consensusTiming(candidates: SubtitleCandidate[], fps: number | null): string | null {
  const weights = new Map<string, number>()
  for (const c of candidates) {
    if (!c.timingGroup || isCam(c)) continue
    if (fps && c.fps && !sameFps(c.fps, fps)) continue
    weights.set(c.timingGroup, (weights.get(c.timingGroup) ?? 0) + 1 + Math.log10(c.downloads + 1))
  }
  let best: string | null = null
  let bestWeight = 0
  for (const [group, weight] of weights) {
    if (weight > bestWeight) {
      best = group
      bestWeight = weight
    }
  }
  return best
}

export function scoreSubtitle(c: SubtitleCandidate, file: FileTraits, consensus: string | null): number {
  let score = Math.log10(c.downloads + 1) * 6

  // Matched to this very file by its fingerprint: in sync, whatever else.
  if (c.hashMatch) score += 300
  // Made for a release of exactly this name — the same file, near enough.
  if (file.key && c.release && releaseKey(c.release) === file.key) score += 150
  // Timed to another frame rate: it drifts further out the longer it plays.
  if (file.fps && c.fps && !sameFps(c.fps, file.fps)) score -= file.fpsKnown ? 120 : 45

  if (c.trusted) score += 8
  if (c.rating >= 8) score += 4
  if (c.bad) score -= 40
  // Offered, but plain subtitles read better by default.
  if (c.hearingImpaired) score -= 6

  // Made for this very release: same encode, same timing — the surest sign
  // of sync there is, so it outweighs popularity and the common timing.
  const group = c.releaseGroup ? c.releaseGroup.toLowerCase() : releaseGroupOf(c.release)
  if (file.group && group && group === file.group) score += 70

  const source = sourceKind(`${c.source} ${c.release}`)
  if (source && source === file.source) score += 20
  // A cinema recording's timing (and often its frame rate) matches nothing else.
  if (source === 'cam' && file.source !== 'cam' && !c.hashMatch) score -= 150

  if (consensus && c.timingGroup === consensus) score += 25
  // Still talking after the file ends: another cut, or another frame rate.
  if (file.duration && c.lastCue !== null && c.lastCue > file.duration + 60) score -= 120
  return score
}

/**
 * Rank every candidate against the playing file and group them by language.
 * Each language keeps its best few versions, at most one per timing (and
 * hearing-impaired or not) — two subtitles with the same timings are the same
 * choice, so the versions on offer differ where it matters: sync.
 */
export function rankSubtitles(candidates: SubtitleCandidate[], file: PlayingFile = {}): SubtitleLanguage[] {
  const duration = file.duration && file.duration > 0 ? file.duration : null

  const byLanguage = new Map<string, SubtitleCandidate[]>()
  const usable: SubtitleCandidate[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (seen.has(c.id) || unusable(c, duration)) continue
    seen.add(c.id)
    usable.push(c)
    const list = byLanguage.get(c.lang) ?? []
    list.push(c)
    byLanguage.set(c.lang, list)
  }

  // The file's frame rate: what subtitles matched to it were timed to, else
  // what most subtitles for the title were (all languages: one video).
  const matchedFps = commonFrameRate(usable.filter((c) => c.hashMatch))
  const fps = matchedFps ?? commonFrameRate(usable)
  const playing: FileTraits = {
    group: file.name ? releaseGroupOf(file.name) : null,
    source: file.name ? sourceKind(file.name) : null,
    duration,
    key: file.name ? releaseKey(file.name) : null,
    fps,
    fpsKnown: matchedFps !== null,
  }

  const languages: SubtitleLanguage[] = []
  for (const [code, list] of byLanguage) {
    const consensus = consensusTiming(list, fps)
    const ranked = list
      .map((c) => ({ c, score: scoreSubtitle(c, playing, consensus) }))
      .sort((a, b) => b.score - a.score || b.c.downloads - a.c.downloads)
    const kept = new Set<string>()
    const options: SubtitleOption[] = []
    for (const { c } of ranked) {
      const key = c.timingGroup ? `${c.timingGroup}:${c.hearingImpaired}` : c.id
      if (kept.has(key)) continue
      kept.add(key)
      options.push({
        id: c.id,
        release: c.release || 'Unknown release',
        hearingImpaired: c.hearingImpaired,
        ...(c.hashMatch ? { matched: true } : {}),
      })
      if (options.length >= MAX_OPTIONS_PER_LANGUAGE) break
    }
    const named = list.find((c) => c.langName)?.langName
    languages.push({ code, name: languageName(code, named), options })
  }

  return languages.sort((a, b) => {
    if (a.code === 'eng' || b.code === 'eng') return a.code === 'eng' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SubtitleSearch {
  imdbId: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  file?: PlayingFile
  /** Languages to search in depth besides English (OpenSubtitles codes). */
  languages?: string[]
}

/**
 * The legacy API's path for a search. Its parameters must come in
 * alphabetical order, and the IMDb id goes without "tt".
 */
export function restSearchPath(q: Pick<SubtitleSearch, 'imdbId' | 'mediaType' | 'season' | 'episode'>, lang?: string): string {
  const imdb = q.imdbId.replace(/^tt0*/i, '')
  const tv = q.mediaType === 'tv'
  const parts: string[] = []
  if (tv) parts.push(`episode-${q.episode}`)
  parts.push(`imdbid-${imdb}`)
  if (tv) parts.push(`season-${q.season}`)
  if (lang) parts.push(`sublanguageid-${lang}`)
  return parts.join('/')
}

export function addonSearchPath(q: Pick<SubtitleSearch, 'imdbId' | 'mediaType' | 'season' | 'episode'>): string {
  return q.mediaType === 'tv'
    ? `subtitles/series/${q.imdbId}:${q.season}:${q.episode}.json`
    : `subtitles/movie/${q.imdbId}.json`
}

// ---------------------------------------------------------------------------
// Fingerprint — OpenSubtitles' hash of the playing file
// ---------------------------------------------------------------------------

/** A file's OpenSubtitles fingerprint: its exact size and hash, as the legacy search takes them. */
export interface FileFingerprint {
  size: string
  hash: string
}

/**
 * OpenSubtitles' hash: the file size plus every little-endian 64-bit word of
 * its first and last 64 KB, wrapping at 64 bits, as 16 hex digits.
 */
export function osHash(size: number, head: Uint8Array, tail: Uint8Array): string {
  let hash = BigInt(size)
  for (const chunk of [head, tail]) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    for (let i = 0; i + 8 <= chunk.byteLength; i += 8) hash = BigInt.asUintN(64, hash + view.getBigUint64(i, true))
  }
  return hash.toString(16).padStart(16, '0')
}

/** The legacy API's path for subtitles matched to a file's fingerprint (parameters alphabetical). */
export function restHashPath(fp: FileFingerprint, lang?: string): string {
  return [`moviebytesize-${fp.size}`, `moviehash-${fp.hash}`, ...(lang ? [`sublanguageid-${lang}`] : [])].join('/')
}

/** Bytes `start`-`end` of a file, and the file's total size from Content-Range. */
async function readRange(link: string, start: number, end: number): Promise<{ bytes: Uint8Array; total: number }> {
  const res = await fetch(link, {
    headers: { Range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(FINGERPRINT_TIMEOUT_MS),
  })
  if (res.status !== 206) {
    await res.body?.cancel()
    throw new Error(`Range read failed: ${res.status}`)
  }
  const total = Number(res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1])
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (!Number.isSafeInteger(total) || bytes.byteLength !== end - start + 1) throw new Error('Unexpected range response')
  return { bytes, total }
}

/**
 * The playing file's fingerprint, read from its Real-Debrid download link —
 * 128 KB, two small range requests. Null for anything but such a link.
 */
export async function fileFingerprint(link: string, size?: number | null): Promise<FileFingerprint | null> {
  if (!DEBRID_DOWNLOAD_LINK_RE.test(link)) return null
  const key = `fingerprint:${link}`
  const hit = await cache.subtitles.get<FileFingerprint>(key)
  if (hit) return hit

  const tailOf = (total: number) => readRange(link, total - FINGERPRINT_CHUNK, total - 1)
  const head = readRange(link, 0, FINGERPRINT_CHUNK - 1)
  // With the size given, both ends at once; otherwise the start says it.
  const known = size && Number.isSafeInteger(size) && size >= 2 * FINGERPRINT_CHUNK ? size : null
  const early = known ? tailOf(known) : null
  early?.catch(() => {}) // unused if the size given turns out wrong
  const first = await head
  if (first.total < 2 * FINGERPRINT_CHUNK) return null
  const last = early && known === first.total ? await early : await tailOf(first.total)
  if (last.total !== first.total) return null

  const hash = osHash(first.total, first.bytes, last.bytes)
  const sizeText = String(first.total)
  if (!FINGERPRINT_HASH_RE.test(hash) || !FINGERPRINT_SIZE_RE.test(sizeText)) return null
  const fingerprint = { size: sizeText, hash }
  await cache.subtitles.set(key, fingerprint)
  return fingerprint
}

/**
 * A fingerprint match for this title (and episode). People match files to
 * subtitles by hand, and a hash can carry another title's subtitles too.
 */
export function belongsTo(c: SubtitleCandidate, q: Pick<SubtitleSearch, 'imdbId' | 'mediaType' | 'season' | 'episode'>): boolean {
  const imdb = imdbNumber(q.imdbId)
  if (!imdb) return false
  if (q.mediaType === 'movie') return c.imdb === imdb
  return c.parentImdb === imdb && c.season === q.season && c.episode === q.episode
}

async function searchRest(path: string): Promise<SubtitleCandidate[]> {
  const res = await fetch(`${OS_REST_BASE}/search/${path}`, {
    headers: { 'User-Agent': userAgent(), 'X-User-Agent': userAgent(), Accept: 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenSubtitles search failed: ${res.status}`)
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? body.map((r) => fromRestResult(r as OsRestResult)).filter((c): c is SubtitleCandidate => !!c) : []
}

async function searchAddon(path: string): Promise<SubtitleCandidate[]> {
  const res = await fetch(`${OS_ADDON_BASE}/${path}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`OpenSubtitles addon failed: ${res.status}`)
  const body = (await res.json()) as { subtitles?: unknown }
  return Array.isArray(body.subtitles)
    ? body.subtitles.map((s) => fromAddonSubtitle(s as AddonSubtitle)).filter((c): c is SubtitleCandidate => !!c)
    : []
}

const inflight = new Map<string, Promise<SubtitleCandidate[]>>()

/** A search from cache, or fetched once however many viewers ask at the same time. Empty results aren't cached. */
async function cachedSearch(key: string, fetcher: () => Promise<SubtitleCandidate[]>): Promise<SubtitleCandidate[]> {
  const hit = await cache.subtitles.get<SubtitleCandidate[]>(key)
  if (hit) return hit
  const pending = inflight.get(key)
  if (pending) return pending
  const lookup = fetcher()
    .then(async (found) => {
      if (found.length > 0) await cache.subtitles.set(key, found)
      return found
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, lookup)
  return lookup
}

function bestEffort(label: string, lookup: Promise<SubtitleCandidate[]>): Promise<SubtitleCandidate[]> {
  return lookup.catch((err: unknown) => {
    logger.warn('Subtitle lookup failed', { source: label, error: err instanceof Error ? err.message : String(err) })
    return []
  })
}

/** Subtitles matched to the playing file's fingerprint, in the deep languages and a sweep of all. */
async function searchByFingerprint(q: SubtitleSearch, deep: string[]): Promise<SubtitleCandidate[]> {
  const link = q.file?.link
  if (!link) return []
  const fingerprint = await fileFingerprint(link, q.file?.size).catch((err: unknown) => {
    logger.warn('Subtitle fingerprint failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  })
  if (!fingerprint) return []
  const found = await Promise.all(
    [...deep.map((l) => restHashPath(fingerprint, l)), restHashPath(fingerprint)].map((path) =>
      bestEffort('opensubtitles-hash', cachedSearch(`rest:${path}`, () => searchRest(path)))
    )
  )
  return found
    .flat()
    .filter((c) => belongsTo(c, q))
    .map((c) => ({ ...c, hashMatch: true }))
}

/**
 * Every subtitle there is for a movie or episode, ranked for the file
 * playing. Subtitles matched to the file's fingerprint lead; English and the
 * requested languages are searched in depth; a sweep of all languages and
 * the addon fill in the rest.
 */
export async function findSubtitles(q: SubtitleSearch): Promise<SubtitleLanguage[]> {
  if (q.mediaType === 'tv' && (q.season == null || q.episode == null)) return []
  const deep = [...new Set(['eng', ...(q.languages ?? [])])].filter((l) => LANGUAGE_CODE_RE.test(l)).slice(0, MAX_DEEP_LANGUAGES)

  const restLookups = [...deep.map((l) => restSearchPath(q, l)), restSearchPath(q)].map((path) =>
    bestEffort('opensubtitles', cachedSearch(`rest:${path}`, () => searchRest(path)))
  )
  const addonPath = addonSearchPath(q)
  const addonLookup = bestEffort('addon', cachedSearch(`addon:${addonPath}`, () => searchAddon(addonPath)))

  const results = await Promise.all([searchByFingerprint(q, deep), ...restLookups, addonLookup])
  // Fingerprint matches first (a subtitle's first record is the one kept),
  // then OpenSubtitles' own records: the same file from the addon knows less.
  return rankSubtitles(results.flat(), q.file)
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export class SubtitleFileError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'SubtitleFileError'
  }
}

/** Text with a subtitle timestamp in it: SubRip/WebVTT ("00:01:02,345") or SubStation ("0:01:02.34"). */
export function looksLikeSubtitles(text: string): boolean {
  return /\d{1,2}:\d{2}:\d{2}[,.]\d{2,3}/.test(text.slice(0, 20_000)) || /^Dialogue:/m.test(text.slice(0, 50_000))
}

/** One subtitle file's text (SubRip, WebVTT or SubStation Alpha), by OpenSubtitles file id. */
export async function fetchSubtitleFile(id: string): Promise<string> {
  if (!SUBTITLE_FILE_ID_RE.test(id)) throw new SubtitleFileError('Invalid subtitle id', 400)
  const key = `file:${id}`
  const hit = await cache.subtitles.get<string>(key)
  if (hit) return hit

  let res: Response
  try {
    res = await fetch(`${SUBTITLE_FILE_BASE}${id}`, { signal: AbortSignal.timeout(FILE_TIMEOUT_MS) })
  } catch (err: unknown) {
    throw new SubtitleFileError(`Subtitle download failed: ${err instanceof Error ? err.message : String(err)}`, 502)
  }
  if (res.status === 404) throw new SubtitleFileError('Subtitle not found', 404)
  if (!res.ok) throw new SubtitleFileError(`Subtitle download failed: ${res.status}`, 502)
  const declared = Number(res.headers.get('content-length'))
  if (declared > MAX_FILE_BYTES) throw new SubtitleFileError('Subtitle file too large', 502)
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_FILE_BYTES) throw new SubtitleFileError('Subtitle file too large', 502)

  const text = new TextDecoder('utf-8').decode(bytes) // drops a leading BOM itself
  if (!looksLikeSubtitles(text)) throw new SubtitleFileError('Not a subtitle file', 502)
  await cache.subtitles.set(key, text, 24 * 60 * 60)
  return text
}
