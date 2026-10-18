import React, { useEffect, useState, useRef } from 'react'
import { ChevronLeft, Share2, Heart, SkipForward, SkipBack, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Media, MediaMode, CONFIG, DEBRID_SERVER_ID, LEGACY_TORBOX_SERVER_ID, defaultServer, serverOptions } from '@/lib/config'
import { DebridPlayerPane, type ReleaseControls } from '@/components/media/DebridPlayerPane'
import { fetchTVSeasons, buildEmbedUrl, logRecommendationInteraction, updateContinueWatching, saveGuestProgress } from '@/lib/api'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { useFavorites } from '@/context/FavoritesContext'
import { useDislikes } from '@/context/DislikesContext'
import { useIsMobile } from '@/mobile-ui/use-mobile'
import { cn, genreIdsOf } from '@/lib/utils'
import { deriveMediaDisplay } from '@/lib/mediaDisplay'
import { MobileDetailSheet } from './movie-detail/MobileDetailSheet'
import { DetailPanel } from './movie-detail/DetailPanel'
import { DownloadButton, ReleaseSelect, SeasonEpisodeSelects, ServerSelect } from './movie-detail/PlaybackPickers'
import type { PlaybackControls } from './movie-detail/types'
import {
  nextEpisode,
  previousEpisode,
  isFirstEpisode,
  isLastEpisode,
  type EpisodePosition,
} from '@/lib/episodeNavigation'

interface Season {
  season_number: number
  episode_count: number
  name: string
}

interface MovieDetailModalProps {
  media: Media
  mode: MediaMode
  onClose: () => void
  initialSeason?: number
  initialEpisode?: number
  initialServer?: string
  autoPlay?: boolean
}

export function MovieDetailModal({
  media: initialMedia,
  mode,
  onClose,
  initialSeason,
  initialEpisode,
  initialServer,
  autoPlay
}: MovieDetailModalProps) {
  // `initialMedia` already comes from Watch.tsx's fetchMediaDetails() call
  // (same append_to_response fields), so there's nothing left to fetch here —
  // this component never has a loading state of its own.
  const [media, setMedia] = useState<Media>(initialMedia)

  const [season, setSeason] = useState(initialSeason || 1)
  const [episode, setEpisode] = useState(initialEpisode || 1)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState(10)

  const [isPlaying, setIsPlaying] = useState(autoPlay || false)
  /** Premium's release picker and download link, reported by the player pane. */
  const [releaseControls, setReleaseControls] = useState<ReleaseControls | null>(null)
  // Picks between two genuinely different pre-play layouts. Only the chosen
  // one is mounted: rendering both and hiding one with CSS would duplicate
  // every control on the screen (two Play buttons, two server pickers).
  const isMobile = useIsMobile()
  const [embedUrl, setEmbedUrl] = useState('')
  const [server, setServer] = useState(() => {
    // A saved server id can outlive the provider it named (renamed/removed in
    // STREAM_PROVIDER_LIST — see config.ts), which otherwise leaves the player
    // silently blank with no matching dropdown entry. Fall back rather than
    // trust a stale id. The debrid server was "torbox" before Real-Debrid.
    if (initialServer === LEGACY_TORBOX_SERVER_ID) return DEBRID_SERVER_ID
    // A saved server (continue watching, quick view) is kept — that's where
    // the viewer's progress is. Anything else starts on ⚡ Premium.
    if (initialServer && serverOptions(mode).some(({ id }) => id === initialServer)) {
      return initialServer
    }
    return defaultServer(mode)
  })
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [playbackStarted, setPlaybackStarted] = useState(false)
  // Mirrored in a ref so the post-load watchdog can read the latest value
  // without being torn down and restarted on every telemetry message.
  const playbackStartedRef = useRef(false)
  const [showStallPrompt, setShowStallPrompt] = useState(false)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Two server pickers exist and only one is ever mounted (the desktop command
  // centre is gated on !isMobile), so the stall prompt has to reach for
  // whichever is actually there — pointing at the desktop one alone left the
  // "Try another server" button doing nothing on a phone.
  const serverSelectTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileServerSelectTriggerRef = useRef<HTMLButtonElement>(null)
  const openServerPicker = () =>
    (serverSelectTriggerRef.current ?? mobileServerSelectTriggerRef.current)?.click()

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  const { toggleFavorite, isFavorited } = useFavorites()
  const { toggleDislike, isDisliked } = useDislikes()
  const [isLiked, setIsLiked] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const handleLikeToggle = async () => {
    const newValue = !isLiked
    setIsLiked(newValue)
    if (newValue) {
      const genreIds = genreIdsOf(initialMedia)

      try {
        if (isAuthenticated) {
          const token = await getAccessTokenSilently()
          await logRecommendationInteraction(token, {
            tmdbId: initialMedia.id,
            mediaType: typedMode,
            eventType: 'rate',
            rating: 5,
            genreIds,
          })
        } else {
          await logRecommendationInteraction(null, {
            tmdbId: initialMedia.id,
            mediaType: typedMode,
            eventType: 'rate',
            rating: 5,
            genreIds,
          })
        }
      } catch (err) {
        console.error('Failed to log rate event:', err)
      }
    }
  }

  // Track if we have already logged a watch event for this session/media
  const hasLoggedWatch = useRef(false)

  const typedMode = mode as 'movie' | 'tv'
  const favorited = isFavorited(initialMedia.id, typedMode)
  const disliked = isDisliked(initialMedia.id, typedMode)

  // --- CONTINUE WATCHING PROGRESS TRACKING ---
  // Since the player is a cross-origin iframe we can't read playback time.
  // We use time-based heuristics instead.
  const watchStartTimeRef = useRef<number | null>(null) // ms since epoch when current ep started
  const startSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevEpisodeRef = useRef<{ season: number; episode: number } | null>(null)

  // Persist progress for any episode (handles auth + guest)
  const saveProgress = React.useCallback(
    async (s: number, ep: number, prog: number) => {
      if (mode !== 'movie' && mode !== 'tv') return
      const item = {
        tmdbId: media.id,
        mediaType: typedMode,
        season: mode === 'tv' ? s : undefined,
        episode: mode === 'tv' ? ep : undefined,
        progress: prog,
        server,
      }
      try {
        if (isAuthenticated) {
          // Do NOT pass authorizationParams: { audience } here — that forces a
          // silent-auth iframe round-trip which can fail in restricted browsers,
          // resulting in progress never being saved. Auth0 serves a cached token.
          const token = await getAccessTokenSilently()
          await updateContinueWatching(token, item)
        } else {
          saveGuestProgress(item)
        }
      } catch (err) {
        console.error('Failed to save continue watching progress:', err)
      }
    },
    [media.id, typedMode, mode, server, isAuthenticated, getAccessTokenSilently]
  )

  /**
   * Share sheet on mobile, clipboard everywhere else. `navigator.share` must be
   * called straight from the tap to keep the user-gesture, so no awaits before it.
   */
  const handleShare = () => {
    const shareTitle = initialMedia.title || initialMedia.name || 'StreamVault'
    const slug = shareTitle
      ? `-${shareTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
      : ''
    const url = `${window.location.origin}/watch/${typedMode}/${initialMedia.id}${slug}`

    if (typeof navigator.share === 'function') {
      navigator
        .share({ title: shareTitle, url })
        // AbortError just means the user dismissed the sheet
        .catch(() => {})
      return
    }

    navigator.clipboard.writeText(url)
    setIsCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setIsCopied(false), 2000)
  }

  // --- Real-Debrid: real progress instead of the iframe heuristics ---
  // Its player is our own <video>, so it reports the actual position; that
  // replaces the guessed 0.1 / 0.5 below once it arrives.
  /** Fraction watched of the current episode/film, or null until reported. */
  const debridProgressRef = useRef<number | null>(null)
  const lastDebridSaveRef = useRef(0)
  const handleDebridProgress = React.useCallback(
    (position: number, duration: number) => {
      // Same bar as the iframe servers: 30s in before it counts as started.
      if (!(duration > 0) || position < 30) return
      const fraction = Math.min(position / duration, 0.99)
      debridProgressRef.current = fraction
      // The backend row only needs to be roughly current; the exact second
      // lives in the player's own resume point.
      if (Date.now() - lastDebridSaveRef.current < 60_000) return
      lastDebridSaveRef.current = Date.now()
      saveProgress(season, episode, fraction)
    },
    [saveProgress, season, episode]
  )

  // Save mid-watch progress when the user leaves after >= 30s — the real
  // position for Real-Debrid, an estimated 0.5 for embed servers.
  const saveProgressOnExit = () => {
    if (server === DEBRID_SERVER_ID && debridProgressRef.current !== null) {
      saveProgress(season, episode, debridProgressRef.current)
    } else if (isPlaying && watchStartTimeRef.current) {
      const elapsed = Date.now() - watchStartTimeRef.current
      if (elapsed >= 30_000) {
        saveProgress(season, episode, 0.5)
      }
    }
  }

  const handleClose = () => {
    saveProgressOnExit()
    onClose()
  }

  /** Back from the player to the title's details, without leaving the page. */
  const stopPlaying = () => {
    saveProgressOnExit()
    setIsPlaying(false)
  }

  useEffect(() => {
    if (isPlaying) {
      // Real-Debrid plays from a native <video> (see DebridPlayerPane) rather than
      // an embed-provider iframe — it manages its own loading/error state, so
      // none of the iframe stall-detection below applies to it.
      if (server === DEBRID_SERVER_ID) {
        setEmbedUrl('')
        setIframeLoaded(false)
        playbackStartedRef.current = false
        setPlaybackStarted(false)
        setShowStallPrompt(false)
        if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
      } else {
        const url = buildEmbedUrl(mode, server, media.id, { season, episode, media })
        setEmbedUrl(url)

        // Reset the loading/stall UI for the new server or episode, and start
        // a fresh stall timer — cross-origin iframes never report load errors,
        // so a timeout is the only signal we have that a provider is slow/dead.
        setIframeLoaded(false)
        playbackStartedRef.current = false
        setPlaybackStarted(false)
        setShowStallPrompt(false)
        if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
        stallTimerRef.current = setTimeout(() => {
          setShowStallPrompt(true)
        }, 7_000)
      }

      // Log the watch event once when playback starts
      if (!hasLoggedWatch.current) {
        hasLoggedWatch.current = true

        const logWatch = async () => {
          // Extract genre IDs from the media object (already loaded — zero cost)
          const genreIds = genreIdsOf(media)

          try {
            if (isAuthenticated) {
              const token = await getAccessTokenSilently()
              await logRecommendationInteraction(token, {
                tmdbId: media.id,
                mediaType: typedMode,
                eventType: 'watch',
                selectedServer: server,
                genreIds,
              })
            } else {
              await logRecommendationInteraction(null, {
                tmdbId: media.id,
                mediaType: typedMode,
                eventType: 'watch',
                selectedServer: server,
                genreIds,
              })
            }

            // Bust the React Query recommendations cache so home page
            // shows fresh "Because you watched X" rows immediately on return
            queryClient.invalidateQueries({ queryKey: ['recommendations'] })
          } catch (err) {
            console.error('Failed to log watch event:', err)
          }
        }

        logWatch()
      }
    }

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
    }
  }, [isPlaying, server, media, mode, season, episode, isAuthenticated, getAccessTokenSilently, typedMode, queryClient])

  // Players post playback telemetry (MEDIA_DATA / PLAYER_EVENT) to the parent
  // window. That is the only evidence a cross-origin iframe gives us that a
  // stream actually started: the iframe's `load` event only proves the
  // provider's page arrived, not that it ever resolved a source. A provider
  // whose source lookup hangs renders its own spinner and posts nothing at all,
  // which is exactly what this listener distinguishes.
  useEffect(() => {
    if (!isPlaying) return

    const onMessage = (event: MessageEvent) => {
      if (!CONFIG.PLAYER_MESSAGE_ORIGINS.includes(event.origin)) return

      let payload: unknown = event.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          return
        }
      }
      if (!payload || typeof payload !== 'object') return

      const { type } = payload as { type?: string }
      if (type !== 'MEDIA_DATA' && type !== 'PLAYER_EVENT') return

      playbackStartedRef.current = true
      setPlaybackStarted(true)
      setShowStallPrompt(false)
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isPlaying])

  // Save progress=0.1 after 30 seconds of playback (marks episode as "started")
  useEffect(() => {
    if (!isPlaying) return

    // Record when this episode started
    watchStartTimeRef.current = Date.now()
    debridProgressRef.current = null
    lastDebridSaveRef.current = 0

    // Clear any existing start timer
    if (startSaveTimerRef.current) clearTimeout(startSaveTimerRef.current)

    startSaveTimerRef.current = setTimeout(() => {
      // Real-Debrid already saved its real position — don't overwrite it.
      if (debridProgressRef.current !== null) return
      saveProgress(season, episode, 0.1)
    }, 30_000) // 30 seconds

    return () => {
      if (startSaveTimerRef.current) clearTimeout(startSaveTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, season, episode])

  // When the user skips to another episode while playing:
  //  - mark the OLD episode as finished (0.99)
  //  - record the NEW episode as started (0.1) via the timer above
  useEffect(() => {
    if (!isPlaying) {
      prevEpisodeRef.current = null
      return
    }

    const prev = prevEpisodeRef.current
    if (prev && (prev.season !== season || prev.episode !== episode)) {
      // Mark previous episode as done
      saveProgress(prev.season, prev.episode, 0.99)
    }

    prevEpisodeRef.current = { season, episode }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, episode, isPlaying])

  // Lock body scroll
  useEffect(() => {
    const prev = window.getComputedStyle(document.body).overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (mode === 'tv') {
      const timer = setTimeout(() => {
        fetchTVSeasons(initialMedia.id).then((data) => {
          setSeasons(data)
          if (data.length > 0) {
            // Only fall back to the first season if an initialSeason wasn't passed down
            if (!initialSeason) {
              const firstSeason = data.find((s) => s.season_number === 1) || data[0]
              setSeason(firstSeason.season_number)
            }
          }
        }).catch((err) => {
          console.error('Failed to fetch seasons:', err)
          setSeasons([])
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [initialMedia.id, mode, initialSeason])

  useEffect(() => {
    const currentSeason = seasons.find((s) => s.season_number === season)
    if (currentSeason) setCurrentSeasonEpisodes(currentSeason.episode_count)
  }, [season, seasons])

  // Keep `media` in sync with the `initialMedia` prop when navigating directly
  // between two titles (React Router keeps this component instance mounted
  // across /watch/:mediaType/:idAndSlug param changes — no fetch needed here,
  // Watch.tsx already owns fetching full details via fetchMediaDetails()).
  useEffect(() => {
    setMedia(initialMedia)
  }, [initialMedia])

  const display = deriveMediaDisplay(media, mode)
  const { title, heroImage, posterImage } = display

  // Episode navigation within and across seasons
  const goToEpisode = (target: EpisodePosition | null) => {
    if (!target) return // already at the first/last episode
    setSeason(target.season)
    setEpisode(target.episode)
  }

  const position = { season, episode }
  const handleSkipNext = () =>
    goToEpisode(nextEpisode(position, seasons, currentSeasonEpisodes))
  const handleSkipPrev = () => goToEpisode(previousEpisode(position, seasons))
  const hasNextEpisode = mode === 'tv' && nextEpisode(position, seasons, currentSeasonEpisodes) !== null

  // Disabled states for navigation buttons
  const isAtAbsoluteFirstEpisode = isFirstEpisode(position, seasons)
  const isAtAbsoluteLastEpisode = isLastEpisode(position, seasons, currentSeasonEpisodes)

  // Everything the two detail layouts need to drive playback. Both render the
  // same controls, so they take one group rather than a dozen props each.
  const playbackControls: PlaybackControls = {
    mode,
    season,
    episode,
    seasons,
    episodeCount: currentSeasonEpisodes,
    server,
    onSeasonChange: setSeason,
    onEpisodeChange: setEpisode,
    onServerChange: setServer,
    onPlay: () => setIsPlaying(true),
  }

  const nextTarget = mode === 'tv' ? nextEpisode(position, seasons, currentSeasonEpisodes) : null
  const nextLabel = nextTarget ? `S${nextTarget.season} · E${nextTarget.episode}` : undefined
  const nowPlayingLine =
    mode === 'tv' ? `Season ${season} · Episode ${episode}` : [display.year, display.durationStr].filter(Boolean).join(' · ')

  const episodeStepButton =
    'flex shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-white transition-colors hover:bg-white/[0.12] disabled:pointer-events-none disabled:opacity-30'

  // --- RENDER ---
  return (
    // Always dark: a title page is a screening room, whatever the site theme.
    // Scoping `dark` here keeps every token below on the dark palette.
    <div className="dark animate-fade fixed inset-0 z-50 overflow-hidden bg-background font-sans text-foreground" data-testid="title-page">
      {/* ── Ambient background (fixed, never scrolls) ── */}
      <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
        <picture>
          {/* A 16:9 backdrop cropped to a portrait phone is mostly sky and
              shoulders — the poster is the art that was composed for it.
              Declared as an override so the <img> keeps the backdrop as its
              own src, which is what non-picture-aware consumers read. */}
          <source media="(max-width: 767px)" srcSet={posterImage} />
          <img
            src={heroImage}
            alt=""
            fetchPriority="high"
            decoding="async"
            className={cn(
              // Capped to the top of the screen on mobile: stretching a 2:3
              // poster over a 0.46:1 viewport crops ~45% of its width away
              // and blows the rest up past its own resolution.
              'h-[58svh] w-full object-cover object-top transition-opacity duration-700 md:h-full md:object-center',
              // Only opacity animates; the blur is applied at once (an
              // animated blur repaints the whole screen every frame).
              isPlaying ? 'opacity-[0.14] md:blur-2xl' : 'opacity-100 md:opacity-60'
            )}
          />
        </picture>
        {/* Portrait scrim: art up top, solid background where the sheet sits */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background md:bg-gradient-to-t md:from-background md:via-background/75 md:to-background/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent opacity-90 max-md:hidden" />
      </div>

      {/* ── Top navigation (non-scrolling) ── */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[100] flex items-center justify-between px-4 py-4 transition-opacity duration-300 max-md:pt-[calc(1rem+env(safe-area-inset-top,0px))] md:px-10 md:py-6',
          // The takeover player draws its own back control over the video
          isPlaying && 'player-hide-chrome'
        )}
      >
        <button
          onClick={isPlaying ? stopPlaying : handleClose}
          aria-label={isPlaying ? 'Back to details' : 'Back'}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center gap-1.5 rounded-full bg-black/45 text-sm font-medium text-white/85 transition-colors hover:bg-black/65 hover:text-white md:h-11 md:w-auto md:pl-3 md:pr-4"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="hidden md:inline">Back</span>
        </button>
        <div className="pointer-events-auto flex gap-2 md:gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(initialMedia.id, typedMode, genreIdsOf(initialMedia))
            }}
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={favorited}
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white/85 transition-colors hover:bg-black/65 hover:text-white tap-scale md:h-11 md:w-11"
          >
            <Heart className={cn('h-5 w-5 transition-colors', favorited ? 'fill-red-500 text-red-500' : 'group-hover:text-red-400')} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleShare()
            }}
            aria-label={isCopied ? 'Link copied' : 'Copy share link'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white/85 transition-colors hover:bg-black/65 hover:text-white tap-scale md:h-11 md:w-11"
          >
            {isCopied ? <Check className="h-5 w-5 text-emerald-400" /> : <Share2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          LAYER 1 — PRE-PLAY
          ══════════════════════════════════════════ */}
      {!isPlaying &&
        (isMobile ? (
          /* Mobile — scrollable sheet over the artwork */
          <div className="custom-scrollbar absolute inset-0 z-10 overflow-y-auto overscroll-contain">
            <MobileDetailSheet
              display={display}
              playback={playbackControls}
              favorited={favorited}
              onToggleFavorite={() => toggleFavorite(initialMedia.id, typedMode, genreIdsOf(initialMedia))}
              isCopied={isCopied}
              onShare={handleShare}
            />
          </div>
        ) : (
          /* Desktop — bottom-anchored */
          <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto">
            <div className="mx-auto mt-auto w-full max-w-[1500px] px-6 pb-12 md:px-16 lg:px-24">
              <DetailPanel
                display={display}
                playback={playbackControls}
                isPrePlay
                isLiked={isLiked}
                onToggleLike={handleLikeToggle}
                disliked={disliked}
                onToggleDislike={() => toggleDislike(initialMedia.id, typedMode)}
              />
            </div>
          </div>
        ))}

      {/* ══════════════════════════════════════════
          LAYER 2 — THEATER
          ══════════════════════════════════════════ */}
      {isPlaying && (
        <div className="custom-scrollbar absolute inset-0 z-10 overflow-y-auto overflow-x-hidden max-md:overflow-hidden max-md:bg-black">
          <div className="mx-auto w-full max-w-[1500px] px-4 pb-8 pt-20 max-md:px-0 max-md:pb-0 max-md:pt-0 md:px-12 md:pb-16 md:pt-24 lg:px-24">
            {/* Opacity only: a transform here would capture the phone
                player's position:fixed takeover while it ran. */}
            <div className="animate-fade flex w-full flex-col md:gap-8">
              {/*
                Video player.

                One player for every viewport — the container is what
                changes. On md+ it's an inline 16:9 card; below md the
                `.player-shell` class takes the whole screen (portrait:
                back bar, picture, then the episode and server pickers;
                landscape: edge to edge).
              */}
              <div
                data-own-controls={server === DEBRID_SERVER_ID || undefined}
                className="player-shell relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] max-md:aspect-auto max-md:rounded-none max-md:shadow-none max-md:ring-0"
              >
                {/* Back bar — phones; the desktop page has its own */}
                <div className="player-chrome-top pointer-events-none z-[110] items-center gap-2 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
                  <button
                    onClick={stopPlaying}
                    aria-label="Back to details"
                    className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors active:bg-white/10"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{title}</p>
                    {mode === 'tv' && (
                      <p className="truncate text-xs text-white/55">
                        S{season} · E{episode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="player-frame">
                  {server === DEBRID_SERVER_ID ? (
                    <DebridPlayerPane
                      title={title}
                      year={display.year}
                      imdbId={media.imdb_id ?? media.external_ids?.imdb_id}
                      mediaType={mode === 'tv' ? 'tv' : 'movie'}
                      season={mode === 'tv' ? season : undefined}
                      episode={mode === 'tv' ? episode : undefined}
                      onSwitchServer={openServerPicker}
                      onBack={stopPlaying}
                      backdropUrl={heroImage}
                      onProgress={handleDebridProgress}
                      onNext={hasNextEpisode ? handleSkipNext : undefined}
                      nextLabel={nextLabel}
                      onReleaseControls={setReleaseControls}
                    />
                  ) : embedUrl ? (
                    <>
                      <iframe
                        src={embedUrl}
                        title={`${title} — ${CONFIG.PROVIDER_NAMES[server] ?? 'player'}`}
                        className="absolute inset-0 h-full w-full"
                        // Embed contract lives in CONFIG so both player render
                        // points stay identical. No `sandbox`: these providers
                        // do not play under one.
                        referrerPolicy={CONFIG.PLAYER_IFRAME_REFERRER_POLICY}
                        allow={CONFIG.PLAYER_IFRAME_ALLOW}
                        onLoad={() => {
                          setIframeLoaded(true)
                          setShowStallPrompt(false)
                          if (stallTimerRef.current) clearTimeout(stallTimerRef.current)

                          // The provider's page is up, but it still has to
                          // resolve a source before anything plays — and that
                          // step can hang indefinitely (a blocked/filtered
                          // source-lookup host leaves the player spinning on
                          // its own loading bar). Keep watching for telemetry
                          // so the user still gets an escape hatch instead of
                          // a frozen player. Only for providers that report;
                          // a silent one would look stalled forever.
                          if (!CONFIG.PROVIDERS_REPORTING_PLAYBACK.includes(server)) return
                          stallTimerRef.current = setTimeout(() => {
                            if (!playbackStartedRef.current) setShowStallPrompt(true)
                          }, 15_000)
                        }}
                      />
                      {!iframeLoaded && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
                          <span className="player-spinner" aria-hidden="true" />
                        </div>
                      )}
                      {showStallPrompt && !playbackStarted && (
                        <div className="absolute bottom-4 left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-black/85 px-4 py-2.5 text-sm text-white/85 shadow-2xl">
                          <span>This server is taking a while…</span>
                          <button
                            onClick={openServerPicker}
                            className="shrink-0 font-semibold text-white underline-offset-4 hover:underline"
                          >
                            Try another server
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="player-spinner" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Portrait: what's playing, and how to change it — in the
                    space under the picture instead of a screen away. Turning
                    the phone hides this and the video takes over. */}
                {isMobile && (
                  <div className="player-chrome-portrait w-full px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4">
                    {mode === 'tv' && (
                      <div className="mb-3 flex items-center gap-2">
                        <button
                          onClick={handleSkipPrev}
                          disabled={isAtAbsoluteFirstEpisode}
                          aria-label="Previous episode"
                          className={cn(episodeStepButton, 'h-12 w-12 tap-scale')}
                        >
                          <SkipBack className="h-5 w-5" />
                        </button>
                        <SeasonEpisodeSelects
                          seasons={seasons}
                          season={season}
                          episode={episode}
                          episodeCount={currentSeasonEpisodes}
                          onSeasonChange={setSeason}
                          onEpisodeChange={setEpisode}
                          className="min-w-0 flex-1 gap-2"
                          triggerClassName="h-12 w-full"
                        />
                        <button
                          onClick={handleSkipNext}
                          disabled={isAtAbsoluteLastEpisode}
                          aria-label="Next episode"
                          className={cn(episodeStepButton, 'h-12 w-12 tap-scale')}
                        >
                          <SkipForward className="h-5 w-5" />
                        </button>
                      </div>
                    )}

                    <ServerSelect
                      mode={mode}
                      value={server}
                      onChange={setServer}
                      triggerRef={mobileServerSelectTriggerRef}
                      className="h-12 w-full"
                    />
                    {server === DEBRID_SERVER_ID && releaseControls && (
                      <div className="mt-2.5 flex gap-2.5">
                        <ReleaseSelect controls={releaseControls} className="h-12 min-w-0 flex-1" />
                        <DownloadButton download={releaseControls.download} showSize={false} className="h-12 shrink-0 px-4" />
                      </div>
                    )}
                    <p className="mt-3 text-center text-xs text-white/55">Turn your phone sideways for full screen</p>

                    <div className="mt-6 border-t border-white/10 pt-5">
                      {nowPlayingLine && <p className="text-[13px] font-medium text-white/50">{nowPlayingLine}</p>}
                      <p className="mt-2 line-clamp-5 text-[15px] leading-relaxed text-white/75">{display.description}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop: what's playing, and the pickers to change it */}
              {!isMobile && (
                <>
                  <div className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <h1 className="truncate font-display text-3xl font-bold tracking-tight text-white lg:text-4xl">{title}</h1>
                      {nowPlayingLine && <p className="mt-1.5 text-base text-white/60">{nowPlayingLine}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {mode === 'tv' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSkipPrev}
                            disabled={isAtAbsoluteFirstEpisode}
                            aria-label="Previous episode"
                            title="Previous episode"
                            className={cn(episodeStepButton, 'h-11 w-11')}
                          >
                            <SkipBack className="h-[18px] w-[18px]" />
                          </button>
                          <SeasonEpisodeSelects
                            seasons={seasons}
                            season={season}
                            episode={episode}
                            episodeCount={currentSeasonEpisodes}
                            onSeasonChange={setSeason}
                            onEpisodeChange={setEpisode}
                            className="w-[18rem] gap-2"
                          />
                          <button
                            onClick={handleSkipNext}
                            disabled={isAtAbsoluteLastEpisode}
                            aria-label="Next episode"
                            title="Next episode"
                            className={cn(episodeStepButton, 'h-11 w-11')}
                          >
                            <SkipForward className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      )}
                      <ServerSelect
                        mode={mode}
                        value={server}
                        onChange={setServer}
                        triggerRef={serverSelectTriggerRef}
                        className="w-64"
                      />
                      {server === DEBRID_SERVER_ID && releaseControls && (
                        <>
                          <ReleaseSelect controls={releaseControls} className="w-64" />
                          <DownloadButton download={releaseControls.download} className="px-4" />
                        </>
                      )}
                    </div>
                  </div>

                  <DetailPanel
                    display={display}
                    playback={playbackControls}
                    isPrePlay={false}
                    isLiked={isLiked}
                    onToggleLike={handleLikeToggle}
                    disliked={disliked}
                    onToggleDislike={() => toggleDislike(initialMedia.id, typedMode)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
