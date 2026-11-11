/**
 * Subtitles for the Premium player: parsing subtitle files into cues, finding
 * the cues on screen at a moment, and the viewer's remembered choices.
 *
 * Cues are drawn by the player itself (SubtitleOverlay), not through a
 * <track>: Real-Debrid's converted stream restarts wherever the viewer jumps
 * to, so the element's clock isn't the film's, and only our own overlay
 * knows the offset between them. Cue text is kept as plain text segments —
 * never HTML — so a subtitle file can't put markup on the page.
 */

/** A run of cue text, italic or not. */
export interface SubtitleSegment {
  text: string
  italic: boolean
}

export interface SubtitleCue {
  /** Seconds into the film. */
  start: number
  end: number
  /** One entry per line on screen. */
  lines: SubtitleSegment[][]
  /** Positioned at the top of the picture ({\an8}) — usually a sign, kept clear of the dialogue. */
  top: boolean
}

export interface SubtitleTrack {
  /** By start time. */
  cues: SubtitleCue[]
  /** The longest cue's length — bounds how far back a lookup has to search. */
  longest: number
}

export type SubtitleSize = 's' | 'm' | 'l'

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** "01:02:03,456", "02:03.456", "1:02:03.45" (SubStation's centiseconds) → seconds. */
function parseTimestamp(value: string): number | null {
  const m = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/)
  if (!m) return null
  const [, h, min, s, frac = '0'] = m
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number(frac.padEnd(3, '0')) / 1000
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name: string) => ENTITIES[name] ?? '')
}

/**
 * Split cue markup into lines of plain-text segments. Understands italics
 * (<i>, {\i1}) and top placement ({\an7}-{\an9}); every other tag — <b>,
 * <font>, <c.yellow>, <v Speaker>, SubStation overrides — is dropped.
 */
function parseCueText(raw: string): { lines: SubtitleSegment[][]; top: boolean } {
  let italic = false
  let top = false
  const lines: SubtitleSegment[][] = []
  for (const rawLine of raw.split('\n')) {
    const line: SubtitleSegment[] = []
    const push = (text: string) => {
      const clean = decodeEntities(text)
      if (!clean) return
      const last = line[line.length - 1]
      if (last && last.italic === italic) last.text += clean
      else line.push({ text: clean, italic })
    }
    const tags = /<\s*(\/?)\s*([a-z]+)[^>]*>|\{([^}]*)\}/gi
    let at = 0
    for (let m = tags.exec(rawLine); m; m = tags.exec(rawLine)) {
      push(rawLine.slice(at, m.index))
      at = m.index + m[0].length
      if (m[2]) {
        if (m[2].toLowerCase() === 'i') italic = m[1] !== '/'
      } else if (m[3] !== undefined) {
        const override = m[3]
        if (/\\i1/.test(override)) italic = true
        if (/\\i0/.test(override)) italic = false
        if (/\\an[789]/.test(override)) top = true
      }
    }
    push(rawLine.slice(at))
    const trimmed = line.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ') }))
    // Trim the line's ends without losing an italic run's inner spaces.
    if (trimmed.length) {
      trimmed[0].text = trimmed[0].text.trimStart()
      trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.trimEnd()
    }
    const kept = trimmed.filter((s) => s.text)
    if (kept.length) lines.push(kept)
  }
  return { lines, top }
}

function parseSubRip(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const rows = block.split('\n')
    const timing = rows.findIndex((r) => r.includes('-->'))
    if (timing < 0) continue // WebVTT header, NOTE and STYLE blocks
    const [from, rest = ''] = rows[timing].split('-->')
    const start = parseTimestamp(from)
    // WebVTT puts cue settings after the end time ("00:01.000 --> 00:02.000 align:start")
    const end = parseTimestamp(rest.trim().split(/\s+/)[0] ?? '')
    if (start === null || end === null || end <= start) continue
    const { lines, top } = parseCueText(rows.slice(timing + 1).join('\n'))
    if (lines.length) cues.push({ start, end, lines, top })
  }
  return cues
}

function parseSubStation(text: string): SubtitleCue[] {
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']
  let inEvents = false
  const cues: SubtitleCue[] = []
  for (const row of text.split('\n')) {
    const line = row.trim()
    if (/^\[.*\]$/.test(line)) {
      inEvents = /^\[events\]$/i.test(line)
      continue
    }
    if (!inEvents) continue
    if (/^format:/i.test(line)) {
      fields = line.slice(7).split(',').map((f) => f.trim().toLowerCase())
      continue
    }
    if (!/^dialogue:/i.test(line)) continue
    const parts = line.slice(9).split(',')
    const textAt = fields.indexOf('text')
    if (textAt < 0 || parts.length < fields.length) continue
    const value = (name: string) => parts[fields.indexOf(name)] ?? ''
    const raw = parts.slice(textAt).join(',')
    // Vector drawings (\p1) are shapes, not words.
    if (/\{[^}]*\\p[1-9]/.test(raw)) continue
    const start = parseTimestamp(value('start'))
    const end = parseTimestamp(value('end'))
    if (start === null || end === null || end <= start) continue
    const { lines, top } = parseCueText(raw.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '))
    if (lines.length) cues.push({ start, end, lines, top })
  }
  return cues
}

/** Lines an uploader or a site added: "Subtitles by …", "www.OpenSubtitles.org", "Support us and become VIP member…". */
const SITE_AD_RE = /\b(opensubtitles|osdb\.link|subscene|addic7ed|podnapisi|yifysubtitles|yts\.(mx|am|lt|ag))\b|become vip member/i
const CREDIT_RE = /\b(subtitles?|subs|captions?|synch?(ed|ronized)?|re-?sync(ed)?|ripped|corrected|edited|transcript|translated|translation)\b.{0,40}\b(by|from)\b/i

function cueText(cue: SubtitleCue): string {
  return cue.lines.map((l) => l.map((s) => s.text).join('')).join(' ')
}

/**
 * Parse a subtitle file — SubRip (.srt), WebVTT or SubStation Alpha
 * (.ssa/.ass), told apart by content — into cues sorted by start time.
 * Advertising lines are dropped, and so are uploader credits at either end.
 */
export function parseSubtitles(input: string): SubtitleTrack {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const isSubStation = /^\s*\[script info\]/i.test(text) || /^dialogue:/im.test(text.slice(0, 50_000))
  const parsed = (isSubStation ? parseSubStation(text) : parseSubRip(text)).sort((a, b) => a.start - b.start)

  const cues = parsed.filter((cue, i) => {
    const words = cueText(cue)
    if (SITE_AD_RE.test(words)) return false
    const atAnEnd = i < 2 || i >= parsed.length - 2
    return !(atAnEnd && CREDIT_RE.test(words))
  })
  return { cues, longest: cues.reduce((max, c) => Math.max(max, c.end - c.start), 0) }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** The cues on screen at `time` (seconds into the film), in start order. */
export function activeCues(track: SubtitleTrack, time: number): SubtitleCue[] {
  const { cues, longest } = track
  // Last cue starting at or before `time`
  let lo = 0
  let hi = cues.length - 1
  let last = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= time) {
      last = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const active: SubtitleCue[] = []
  for (let i = last; i >= 0 && cues[i].start >= time - longest; i--) {
    if (cues[i].end > time) active.push(cues[i])
  }
  return active.reverse()
}

// ---------------------------------------------------------------------------
// The viewer's choices
// ---------------------------------------------------------------------------

export interface SubtitlePrefs {
  /** OpenSubtitles language code, or null for subtitles off. */
  language: string | null
  /** The language to turn back on (the CC button, the C key). */
  lastLanguage: string
  size: SubtitleSize
}

const PREFS_KEY = 'sv:player:subtitles'
export const DEFAULT_SUBTITLE_PREFS: SubtitlePrefs = { language: 'eng', lastLanguage: 'eng', size: 'm' }

const LANGUAGE_RE = /^[a-z]{3}$/

export function readSubtitlePrefs(): SubtitlePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_SUBTITLE_PREFS
    const parsed = JSON.parse(raw) as Partial<Record<keyof SubtitlePrefs, unknown>>
    const language = parsed.language === null ? null : typeof parsed.language === 'string' && LANGUAGE_RE.test(parsed.language) ? parsed.language : 'eng'
    const lastLanguage =
      typeof parsed.lastLanguage === 'string' && LANGUAGE_RE.test(parsed.lastLanguage) ? parsed.lastLanguage : (language ?? 'eng')
    const size = parsed.size === 's' || parsed.size === 'l' ? parsed.size : 'm'
    return { language, lastLanguage, size }
  } catch {
    return DEFAULT_SUBTITLE_PREFS
  }
}

export function storeSubtitlePrefs(prefs: SubtitlePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Not remembering the choice is fine.
  }
}

/** Languages for the menu: the viewer's own first, then English, then the rest by name. */
export function orderLanguages<T extends { code: string; name: string }>(languages: T[], preferred: string | null): T[] {
  const rank = (code: string) => (code === preferred ? 0 : code === 'eng' ? 1 : 2)
  return [...languages].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name))
}

/** "+0.5s", "−1.25s", "0.0s" — a timing adjustment as the menu shows it. */
export function formatSubtitleDelay(seconds: number): string {
  if (Math.abs(seconds) < 0.005) return '0.0s'
  const text = Math.abs(seconds).toFixed(2).replace(/0$/, '')
  return `${seconds > 0 ? '+' : '−'}${text}s`
}
