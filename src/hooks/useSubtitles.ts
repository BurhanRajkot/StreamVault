/**
 * useSubtitles — the Premium player's subtitles: which languages there are
 * for the playing file, which one the viewer wants, and its cues.
 *
 * The language (or "off") and the text size are remembered across titles.
 * The version within a language and the timing nudge belong to one file —
 * another release has other timings — so they start over when it changes.
 * A version that won't load, or has no lines, is passed over for the next.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSubtitles, fetchSubtitleText, type SubtitleLanguage, type SubtitleOption } from '@/lib/debridApi'
import {
  orderLanguages,
  parseSubtitles,
  readSubtitlePrefs,
  storeSubtitlePrefs,
  type SubtitlePrefs,
  type SubtitleSize,
  type SubtitleTrack,
} from '@/lib/subtitles'

export interface PlayerSubtitles {
  /** Finding the list, found some, found none, or the search failed. */
  status: 'loading' | 'ready' | 'none' | 'error'
  /** What the settings menu's Subtitles row says: "English", "Off", "Searching…", ... */
  summary: string
  /** For the menu: the viewer's language first, then English, then the rest by name. */
  languages: SubtitleLanguage[]
  /** The language on screen — null when off, or when neither the chosen language nor English exists for this file. */
  language: string | null
  /** The version on screen. */
  option: SubtitleOption | null
  /** Its cues, once loaded. */
  track: SubtitleTrack | null
  /** The chosen version is loading. */
  loadingTrack: boolean
  /** Seconds added to every cue: positive shows them later. */
  delay: number
  size: SubtitleSize
  /** Show `language` (null: turn subtitles off), optionally a given version of it. */
  select: (language: string | null, optionId?: string) => void
  /** Off, or back on in the last language shown. */
  toggle: () => void
  setDelay: (seconds: number) => void
  setSize: (size: SubtitleSize) => void
}

interface UseSubtitlesParams {
  imdbId?: string | null
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  /** The playing file; nothing is searched until there is one. */
  fileName?: string | null
  /** Its length in seconds. */
  duration?: number | null
  /** Its Real-Debrid link and size in bytes — for subtitles matched to this very file. */
  fileUrl?: string | null
  fileSize?: number | null
}

/** Per-file state: the version picked in each language, and the timing nudge. */
interface FileState {
  file: string | null
  versions: Record<string, string>
  delay: number
  /** Versions that failed to load or had no lines. */
  broken: string[]
}

const EMPTY_FILE_STATE: FileState = { file: null, versions: {}, delay: 0, broken: [] }

export function useSubtitles(
  { imdbId, mediaType, season, episode, fileName, duration, fileUrl, fileSize }: UseSubtitlesParams,
  getToken: () => Promise<string | undefined>
): PlayerSubtitles {
  const [prefs, setPrefs] = useState<SubtitlePrefs>(readSubtitlePrefs)
  const [fileState, setFileState] = useState<FileState>(EMPTY_FILE_STATE)
  const file = fileName ?? null
  // State saved for another file reads as fresh: a new file starts clean without an effect.
  const current = fileState.file === file ? fileState : { ...EMPTY_FILE_STATE, file }
  const updateFile = useCallback(
    (change: (state: FileState) => Partial<FileState>) =>
      setFileState((prev) => {
        const base = prev.file === file ? prev : { ...EMPTY_FILE_STATE, file }
        return { ...base, ...change(base) }
      }),
    [file]
  )

  const searchable = !!imdbId && !!file && (mediaType === 'movie' || (season != null && episode != null))
  /** A language besides English to search in depth — the viewer's own. */
  const deepLanguage = prefs.language && prefs.language !== 'eng' ? prefs.language : null
  const roundedDuration = duration && duration > 0 ? Math.round(duration) : 0

  const list = useQuery({
    queryKey: ['subtitles', imdbId, mediaType, season ?? null, episode ?? null, file, roundedDuration, deepLanguage, fileUrl ?? null, fileSize ?? null],
    queryFn: async ({ signal }) =>
      fetchSubtitles(
        {
          imdbId: imdbId!,
          mediaType,
          season,
          episode,
          fileName: file ?? undefined,
          duration: roundedDuration || null,
          fileUrl: fileUrl ?? undefined,
          fileSize,
          languages: deepLanguage ? [deepLanguage] : [],
        },
        await getToken(),
        signal
      ),
    enabled: searchable,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    // Another release or a deeper search of the same episode: keep showing
    // what's there meanwhile. Never another episode's.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey
      return key && key[1] === imdbId && key[3] === (season ?? null) && key[4] === (episode ?? null) ? previous : undefined
    },
  })

  const languages = useMemo(() => orderLanguages(list.data ?? [], prefs.language), [list.data, prefs.language])

  const language = useMemo(() => {
    if (!prefs.language) return null
    if (languages.some((l) => l.code === prefs.language)) return prefs.language
    // Not in the chosen language: English beats nothing.
    return languages.some((l) => l.code === 'eng') ? 'eng' : null
  }, [languages, prefs.language])

  const option = useMemo(() => {
    const options = languages.find((l) => l.code === language)?.options ?? []
    const usable = options.filter((o) => !current.broken.includes(o.id))
    const picked = language ? current.versions[language] : undefined
    return usable.find((o) => o.id === picked) ?? usable[0] ?? null
  }, [languages, language, current.versions, current.broken])

  const optionId = option?.id ?? null
  const cues = useQuery({
    queryKey: ['subtitle-file', optionId],
    queryFn: async ({ signal }) => parseSubtitles(await fetchSubtitleText(optionId!, await getToken(), signal)),
    enabled: !!optionId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  })

  // A version that can't be shown: move on to the next.
  const failed = !!optionId && (cues.isError || (cues.isSuccess && cues.data.cues.length === 0))
  useEffect(() => {
    if (!failed || !optionId) return
    console.warn(`Subtitles ${optionId} unusable — trying the next version`)
    updateFile((s) => ({ broken: s.broken.includes(optionId) ? s.broken : [...s.broken, optionId] }))
  }, [failed, optionId, updateFile])

  const savePrefs = useCallback((change: (p: SubtitlePrefs) => SubtitlePrefs) => {
    setPrefs((prev) => {
      const next = change(prev)
      storeSubtitlePrefs(next)
      return next
    })
  }, [])

  const select = useCallback(
    (lang: string | null, versionId?: string) => {
      savePrefs((p) => ({ ...p, language: lang, lastLanguage: lang ?? p.lastLanguage }))
      if (lang && versionId) updateFile((s) => ({ versions: { ...s.versions, [lang]: versionId } }))
    },
    [savePrefs, updateFile]
  )

  const toggle = useCallback(() => {
    savePrefs((p) => ({ ...p, language: p.language ? null : p.lastLanguage }))
  }, [savePrefs])

  const setDelay = useCallback(
    (seconds: number) => updateFile(() => ({ delay: Math.round(Math.min(Math.max(seconds, -60), 60) * 100) / 100 })),
    [updateFile]
  )

  const setSize = useCallback((size: SubtitleSize) => savePrefs((p) => ({ ...p, size })), [savePrefs])

  const status: PlayerSubtitles['status'] = !imdbId
    ? 'none'
    : list.data
      ? list.data.length > 0
        ? 'ready'
        : 'none'
      : list.isError
        ? 'error'
        : 'loading'

  const track = failed ? null : (cues.data ?? null)
  const summary =
    status === 'loading'
      ? 'Searching…'
      : status === 'error'
        ? 'Unavailable'
        : status === 'none'
          ? 'None found'
          : (languages.find((l) => l.code === language)?.name ?? 'Off')
  return useMemo(
    () => ({
      status,
      summary,
      languages,
      language,
      option,
      track,
      loadingTrack: !!optionId && cues.isPending,
      delay: current.delay,
      size: prefs.size,
      select,
      toggle,
      setDelay,
      setSize,
    }),
    [status, summary, languages, language, option, track, optionId, cues.isPending, current.delay, prefs.size, select, toggle, setDelay, setSize]
  )
}
