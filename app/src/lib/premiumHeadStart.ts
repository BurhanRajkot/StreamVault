import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { DEBRID_SERVER_ID } from '@/lib/config'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { warmNearestEdge } from '@/lib/debridHost'
import { estimateConnection } from '@/lib/connection'
import { prefetchPremiumReleases } from '@/lib/premiumSearch'
import { warmPremiumTitle } from '@/lib/premiumWarm'
import { audioLanguageFor } from '@/lib/audioLanguage'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useDebridToken } from '@/hooks/useDebridToken'
import { getSettings } from '@app/lib/settings'
import { startServer } from '@app/lib/startServer'
import { fetchTitleDetails, type TitleKind } from '@app/lib/useTitle'

/*
 * Premium, ready before Play.
 *
 * A Premium start is a chain of waits: the title's details (for its IMDb id),
 * the release search, Real-Debrid getting the release ready (~3-5 s), and
 * the connection measured to choose it. Every place a playback can begin
 * from — a title's page, a Continue Watching card, the hero's Play, the end
 * of an episode — starts the whole chain here as soon as the viewer shows
 * they're about to watch, so Play finds the answer waiting (lib/premiumWarm)
 * and goes straight to the picture.
 *
 * One head start per title and episode for a while: hovering the same card
 * twice, or the title page after its card, asks nothing again.
 */

export interface HeadStartTarget {
  kind: TitleKind
  id: number
  /** The episode Play would start — a show's first, when not given. */
  season?: number
  episode?: number
}

/** A head start is good for this long — the warmed answer itself keeps 10 minutes (lib/premiumWarm). */
const HEAD_START_TTL_MS = 8 * 60_000
const started = new Map<string, number>()

function headStartKey({ kind, id, season, episode }: HeadStartTarget): string {
  return kind === 'tv' ? `tv:${id}:${season ?? 1}:${episode ?? 1}` : `movie:${id}`
}

/** Start getting this title (or episode) ready on Premium. Never throws; once per title for a while. */
export function headStartPremium(queryClient: QueryClient, target: HeadStartTarget, getToken: () => Promise<string | undefined>): void {
  if (!(target.id > 0)) return
  const key = headStartKey(target)
  const at = started.get(key)
  if (at && Date.now() - at < HEAD_START_TTL_MS) return
  started.set(key, Date.now())

  // Both are measured once and kept; the warm-up waits for the connection before choosing
  warmNearestEdge()
  void estimateConnection().catch(() => null)

  void (async () => {
    try {
      const [media, token] = await Promise.all([fetchTitleDetails(queryClient, target.kind, target.id), getToken()])
      // Just as the player names it (PlayerScreen → PremiumPane), so both share one search
      const display = deriveMediaDisplay(media, target.kind)
      const tv = target.kind === 'tv'
      const search = {
        title: display.title,
        year: display.year,
        imdbId: media.imdb_id ?? media.external_ids?.imdb_id,
        mediaType: target.kind,
        season: tv ? target.season ?? 1 : undefined,
        episode: tv ? target.episode ?? 1 : undefined,
        // As PlayerScreen asks it (useAudioLanguage), so both share one search and one release
        audioLang: audioLanguageFor(media, target.kind),
      }
      prefetchPremiumReleases(search, token)
      await warmPremiumTitle(search, token, tv ? media.episode_run_time?.[0] : media.runtime)
    } catch {
      // Let a later intent try again: Play does it all itself meanwhile
      started.delete(key)
    }
  })()
}

/**
 * `headStart(target, saved?)` — a head start, when this viewer's playback of
 * it would begin on Premium (the app's start rule, with the server a
 * Continue Watching row was saved on). A no-op for everyone else.
 */
export function usePremiumHeadStart(): (target: HeadStartTarget, saved?: string | null) => void {
  const queryClient = useQueryClient()
  const { premium } = usePremiumAccess()
  const getToken = useDebridToken()
  return useCallback(
    (target: HeadStartTarget, saved?: string | null) => {
      if (!premium || startServer(target.kind, premium, getSettings(), saved) !== DEBRID_SERVER_ID) return
      headStartPremium(queryClient, target, getToken)
    },
    [premium, queryClient, getToken]
  )
}

/** A pointer resting this long on a Play button means it's about to be pressed. */
const HOVER_INTENT_MS = 200

/**
 * Pointer and focus handlers for a Play button: a pointer resting on it, a
 * press or keyboard focus gives the head start — the press alone is ~100 ms
 * ahead of the click, a hover often a second or more.
 */
export function usePremiumIntent(target: HeadStartTarget) {
  const headStart = usePremiumHeadStart()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const go = () => headStart(target)
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') timer.current = setTimeout(go, HOVER_INTENT_MS)
    },
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerDown: go,
    onFocus: go,
  }
}

/** Forget every head start — tests only. */
export function resetHeadStartsForTests(): void {
  started.clear()
}
