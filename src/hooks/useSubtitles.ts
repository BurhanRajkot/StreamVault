/**
 * useSubtitles — subtitle state for one title/episode in the Premium player.
 *
 * The track list loads lazily, when the viewer first opens the Subtitles
 * menu — except that a language they turned on before (remembered in
 * localStorage) is re-applied by itself once playback is on screen. Picking
 * a track downloads and parses its .srt; the cues go to DebridVideo's
 * overlay. Everything is best-effort: a failure only shows in the menu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchSubtitleCues,
  readPreferredSubtitleLang,
  searchSubtitles,
  storePreferredSubtitleLang,
  type SubtitleCue,
  type SubtitleTrack,
} from '@/lib/subtitles'
import type { PlayerSubtitles } from '@/components/player/PlayerControls'

interface UseSubtitlesArgs {
  /** Without an IMDb id there's nothing to search by — the menu isn't offered. */
  imdbId?: string | null
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  /** Playback is on screen — lets the remembered language turn itself on. */
  active: boolean
}

export interface SubtitlesController {
  /** The Subtitles menu, for PlayerControls — null when there's no id to search by. */
  menu: PlayerSubtitles | null
  /** The chosen track's cues, for the overlay — null when subtitles are off or still loading. */
  cues: SubtitleCue[] | null
}

export function useSubtitles({ imdbId, mediaType, season, episode, active }: UseSubtitlesArgs): SubtitlesController {
  const [tracks, setTracks] = useState<SubtitleTrack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cues, setCues] = useState<SubtitleCue[] | null>(null)

  const tracksRef = useRef<SubtitleTrack[] | null>(null)
  const searchRef = useRef<Promise<SubtitleTrack[]> | null>(null)
  const cueCacheRef = useRef(new Map<string, SubtitleCue[]>())
  /** Invalidates in-flight cue fetches when the selection (or episode) changes. */
  const selectSeqRef = useRef(0)
  const autoAppliedRef = useRef(false)

  const key = `${imdbId ?? ''}:${season ?? ''}:${episode ?? ''}`
  const keyRef = useRef(key)
  useEffect(() => {
    if (keyRef.current === key) return
    keyRef.current = key
    selectSeqRef.current++
    searchRef.current = null
    tracksRef.current = null
    cueCacheRef.current = new Map()
    autoAppliedRef.current = false
    setTracks(null)
    setLoading(false)
    setError(null)
    setActiveId(null)
    setCues(null)
  }, [key])

  /** The track list, fetched once per title/episode and shared by the menu and auto-enable. */
  const loadTracks = useCallback((): Promise<SubtitleTrack[]> => {
    if (!imdbId) return Promise.resolve([])
    if (searchRef.current) return searchRef.current
    setLoading(true)
    setError(null)
    const request = searchSubtitles(imdbId, mediaType, season, episode)
    searchRef.current = request
    request
      .then((list) => {
        if (searchRef.current !== request) return
        tracksRef.current = list
        setTracks(list)
      })
      .catch(() => {
        if (searchRef.current !== request) return
        searchRef.current = null // let the menu retry on its next open
        setError("Couldn't load the subtitle list. Reopen this menu to retry.")
      })
      .finally(() => {
        if (searchRef.current === request || searchRef.current === null) setLoading(false)
      })
    return request
  }, [imdbId, mediaType, season, episode])

  const ensureTracks = useCallback(() => {
    loadTracks().catch(() => {})
  }, [loadTracks])

  const select = useCallback((id: string | null) => {
    const seq = ++selectSeqRef.current
    if (id === null) {
      setActiveId(null)
      setCues(null)
      storePreferredSubtitleLang(null)
      return
    }
    const track = tracksRef.current?.find((t) => t.id === id)
    if (!track) return
    storePreferredSubtitleLang(track.lang)
    setActiveId(id)
    setError(null)
    const cached = cueCacheRef.current.get(id)
    if (cached) {
      setCues(cached)
      return
    }
    setCues(null)
    fetchSubtitleCues(track.url)
      .then((parsed) => {
        cueCacheRef.current.set(id, parsed)
        if (selectSeqRef.current === seq) setCues(parsed)
      })
      .catch(() => {
        if (selectSeqRef.current !== seq) return
        setActiveId(null)
        setError(`The ${track.label} subtitles failed to load — try another track.`)
      })
  }, [])

  // Turn the remembered language back on once playback is up.
  useEffect(() => {
    if (!active || !imdbId || autoAppliedRef.current) return
    autoAppliedRef.current = true
    const lang = readPreferredSubtitleLang()
    if (!lang) return
    const keyWhenAsked = keyRef.current
    loadTracks()
      .then((list) => {
        if (keyRef.current !== keyWhenAsked || !list.length) return
        const track = list.find((t) => t.lang === lang)
        if (track) select(track.id)
      })
      .catch(() => {})
  }, [active, imdbId, loadTracks, select])

  const menu = useMemo<PlayerSubtitles | null>(
    () => (imdbId ? { tracks, loading, error, activeId, onSelect: select, onOpen: ensureTracks } : null),
    [imdbId, tracks, loading, error, activeId, select, ensureTracks]
  )

  return { menu, cues: activeId ? cues : null }
}
