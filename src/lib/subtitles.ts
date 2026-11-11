/**
 * Subtitles for the Premium player.
 *
 * Tracks come from Stremio's OpenSubtitles addon (opensubtitles-v3.strem.io)
 * — the subtitle counterpart of the Torrentio lookup the backend already
 * does: matched by IMDb id (+ season/episode), keyless, CORS-open, and every
 * file is re-served as UTF-8. The .srt itself downloads straight into the
 * browser; nothing passes through our backend.
 *
 * Cues are rendered by our own overlay (SubtitleOverlay) rather than a
 * <track> element: Real-Debrid's converted stream starts mid-file, so the
 * element's clock is `offset` seconds behind the film's, which native cues
 * can't follow.
 */

const SUBTITLE_ADDON_BASE = 'https://opensubtitles-v3.strem.io'

/** Tracks listed per language — enough to swap when one is out of sync. */
const MAX_TRACKS_PER_LANGUAGE = 3

export interface SubtitleTrack {
  id: string
  /** The UTF-8 .srt download. */
  url: string
  /** Language code as the addon gives it (ISO 639-2, e.g. "eng"). */
  lang: string
  /** Language name shown in the menu, e.g. "English". */
  label: string
  /** The release the subtitles were timed for, when known. */
  release?: string
}

export interface SubtitleCue {
  /** Seconds into the file. */
  start: number
  end: number
  text: string
}

// ---------------------------------------------------------------------------
// Language names
// ---------------------------------------------------------------------------

/** OpenSubtitles codes Intl doesn't know (or names unhelpfully). */
const LANGUAGE_LABEL_OVERRIDES: Record<string, string> = {
  pob: 'Portuguese (Brazil)',
  pb: 'Portuguese (Brazil)',
  scc: 'Serbian',
  mne: 'Montenegrin',
}

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' })
  } catch {
    return null
  }
})()

/** "eng" → "English"; an unknown code comes back as itself. */
export function languageLabel(code: string): string {
  const lower = code.toLowerCase()
  const override = LANGUAGE_LABEL_OVERRIDES[lower]
  if (override) return override
  try {
    const name = displayNames?.of(lower)
    if (name && name.toLowerCase() !== lower) return name
  } catch {
    // Malformed code — fall through to the raw value.
  }
  return code
}

/**
 * Language names the viewer likely wants first, from the browser's own
 * preferences, always ending with English. Comparing *names* ("English")
 * instead of codes sidesteps 639-1 vs 639-2 ("en" vs "eng").
 */
function preferredLanguageLabels(): string[] {
  const codes =
    typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  const labels = codes.filter(Boolean).map((code) => languageLabel(code.split('-')[0]))
  labels.push('English')
  return Array.from(new Set(labels))
}

// ---------------------------------------------------------------------------
// Track search
// ---------------------------------------------------------------------------

interface AddonSubtitle {
  id?: unknown
  url?: unknown
  lang?: unknown
  subtitleFileName?: unknown
  movieReleaseName?: unknown
}

/** Map the addon's response defensively — it's an external service. */
export function tracksFromAddon(data: unknown): SubtitleTrack[] {
  const subtitles = (data as { subtitles?: unknown })?.subtitles
  if (!Array.isArray(subtitles)) return []
  const tracks: SubtitleTrack[] = []
  const seen = new Set<string>()
  for (const entry of subtitles as AddonSubtitle[]) {
    const id = typeof entry?.id === 'string' || typeof entry?.id === 'number' ? String(entry.id) : null
    const url = typeof entry?.url === 'string' && entry.url.startsWith('https://') ? entry.url : null
    const lang = typeof entry?.lang === 'string' && entry.lang ? entry.lang : null
    if (!id || !url || !lang || seen.has(id)) continue
    seen.add(id)
    const fileName = typeof entry.subtitleFileName === 'string' ? entry.subtitleFileName : null
    const releaseName = typeof entry.movieReleaseName === 'string' ? entry.movieReleaseName : null
    const release = (fileName?.replace(/\.[a-z0-9]{2,4}$/i, '') || releaseName || '').trim()
    tracks.push({ id, url, lang, label: languageLabel(lang), release: release || undefined })
  }
  return tracks
}

/**
 * Group by language (keeping the addon's own ranking within each, capped at
 * MAX_TRACKS_PER_LANGUAGE) and order the languages: the viewer's first, then
 * English, then the rest alphabetically.
 */
export function organizeTracks(tracks: SubtitleTrack[], preferred: string[] = preferredLanguageLabels()): SubtitleTrack[] {
  const perLanguage = new Map<string, SubtitleTrack[]>()
  for (const track of tracks) {
    const list = perLanguage.get(track.label) ?? []
    if (list.length < MAX_TRACKS_PER_LANGUAGE) {
      list.push(track)
      perLanguage.set(track.label, list)
    }
  }
  const rank = (label: string) => {
    const i = preferred.indexOf(label)
    return i === -1 ? preferred.length : i
  }
  const labels = Array.from(perLanguage.keys()).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return labels.flatMap((label) => perLanguage.get(label) ?? [])
}

/**
 * Subtitle tracks for a movie or episode, best languages first.
 * Throws on network/HTTP failure — callers should treat this as best-effort.
 */
export async function searchSubtitles(
  imdbId: string,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  const mediaPath =
    mediaType === 'tv' && season != null && episode != null
      ? `series/${encodeURIComponent(`${imdbId}:${season}:${episode}`)}`
      : `movie/${encodeURIComponent(imdbId)}`
  const res = await fetch(`${SUBTITLE_ADDON_BASE}/subtitles/${mediaPath}.json`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Subtitle search failed: ${res.status}`)
  return organizeTracks(tracksFromAddon(await res.json()))
}

// ---------------------------------------------------------------------------
// Cue parsing (SRT and WebVTT)
// ---------------------------------------------------------------------------

const ARROW_RE = /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/

/** "01:02:03,450" or "02:03.450" → seconds. */
function parseTimestamp(raw: string): number {
  const parts = raw.replace(',', '.').split(':').map(Number)
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]]
  return h * 3600 + m * 60 + s
}

/** Strip ASS overrides ({\an8}), markup tags (<i>) and decode the common entities. */
function cleanCueText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>\n]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Parse an SRT or WebVTT file into cues, sorted by start time. Tolerant by
 * design: cue numbers, VTT headers/NOTE blocks and cue settings are ignored,
 * and a malformed block just drops out.
 */
export function parseSubtitles(raw: string): SubtitleCue[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/)
  const cues: SubtitleCue[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ARROW_RE)
    if (!match) continue
    const text: string[] = []
    for (i++; i < lines.length && lines[i].trim() !== ''; i++) text.push(lines[i])
    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    const body = cleanCueText(text)
    if (body && end > start) cues.push({ start, end, text: body })
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end)
}

/** Fetch and parse one track. Throws when the file can't be fetched or holds no cues. */
export async function fetchSubtitleCues(url: string): Promise<SubtitleCue[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Subtitle download failed: ${res.status}`)
  const cues = parseSubtitles(await res.text())
  if (cues.length === 0) throw new Error('Subtitle file held no cues')
  return cues
}

/** The text on screen at `time` (seconds into the file) — overlapping cues stack — or null. */
export function cueTextAt(cues: SubtitleCue[], time: number): string | null {
  const active: string[] = []
  for (const cue of cues) {
    if (cue.start > time) break
    if (time < cue.end) active.push(cue.text)
  }
  return active.length ? active.join('\n') : null
}

// ---------------------------------------------------------------------------
// Remembered language
// ---------------------------------------------------------------------------

const SUBTITLE_LANG_KEY = 'sv:player:subs-lang'

/** The language the viewer last turned on — auto-applied on the next play — or null when off. */
export function readPreferredSubtitleLang(): string | null {
  try {
    return localStorage.getItem(SUBTITLE_LANG_KEY)
  } catch {
    return null
  }
}

export function storePreferredSubtitleLang(lang: string | null) {
  try {
    if (lang) localStorage.setItem(SUBTITLE_LANG_KEY, lang)
    else localStorage.removeItem(SUBTITLE_LANG_KEY)
  } catch {
    // Not remembering it is fine.
  }
}
