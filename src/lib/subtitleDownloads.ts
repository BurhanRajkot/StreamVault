/**
 * Subtitle files to save alongside a download — the same source movy's
 * download picker uses: Vidy's public subtitle search (subtitles.vidy.st).
 * It answers any origin with CORS, by TMDB id (+ season/episode for a show),
 * and serves each file `inline`, so saving one means fetching it and handing
 * the browser a blob with a filename.
 */

const SEARCH_URL = 'https://subtitles.vidy.st/search'

/** One file from the search, as the API returns it (fields we use). */
export interface SubtitleFile {
  url: string
  /** "English", "Portuguese (BR)" */
  display: string
  /** ISO 639-1 */
  language: string
  format: string
  fileName?: string
  isHearingImpaired?: boolean
  isTrusted?: boolean
  downloadCount?: number
}

/** The file offered for one language. */
export interface SubtitleLanguage {
  language: string
  display: string
  file: SubtitleFile
}

export async function searchSubtitleFiles(
  tmdbId: number,
  season?: number,
  episode?: number,
  signal?: AbortSignal
): Promise<SubtitleFile[]> {
  const params = new URLSearchParams({ id: String(tmdbId) })
  if (season !== undefined && episode !== undefined) {
    params.set('season', String(season))
    params.set('episode', String(episode))
  }
  const res = await fetch(`${SEARCH_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Subtitle search failed (${res.status})`)
  const body: unknown = await res.json()
  return Array.isArray(body) ? body.filter(isSubtitleFile) : []
}

function isSubtitleFile(value: unknown): value is SubtitleFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.url === 'string' && v.url.startsWith('https://') && typeof v.display === 'string' && typeof v.language === 'string'
}

/**
 * One file per language: trusted before not, regular before hearing-impaired,
 * then the most downloaded. Languages come back with the viewer's own first,
 * then English, then A–Z.
 */
export function bestPerLanguage(files: SubtitleFile[], preferred: string[] = []): SubtitleLanguage[] {
  const score = (f: SubtitleFile) =>
    (f.isTrusted ? 1_000_000_000 : 0) + (f.isHearingImpaired ? 0 : 100_000_000) + Math.min(f.downloadCount ?? 0, 99_999_999)
  const best = new Map<string, SubtitleFile>()
  for (const file of files) {
    const key = file.display
    const current = best.get(key)
    if (!current || score(file) > score(current)) best.set(key, file)
  }
  const order = [...preferred.map((l) => l.toLowerCase().slice(0, 2)), 'en']
  const rank = (lang: string) => {
    const i = order.indexOf(lang.toLowerCase())
    return i === -1 ? order.length : i
  }
  return [...best.values()]
    .map((file) => ({ language: file.language, display: file.display, file }))
    .sort((a, b) => rank(a.language) - rank(b.language) || a.display.localeCompare(b.display))
}

/** Fetch the file and save it under its own name. */
export async function saveSubtitleFile(file: SubtitleFile, fallbackName: string): Promise<void> {
  const res = await fetch(file.url)
  if (!res.ok) throw new Error(`Subtitle download failed (${res.status})`)
  const blob = await res.blob()
  const name = file.fileName?.trim() || `${fallbackName}.${file.language}.${file.format || 'srt'}`
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}
