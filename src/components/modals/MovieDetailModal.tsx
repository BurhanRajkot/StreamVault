import React, { useEffect, useState, useRef } from 'react'
import { Play, ChevronLeft, Share2, Heart, Server, SkipForward, SkipBack, Check, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Media, MediaMode, CONFIG } from '@/lib/config'
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
import type { PlaybackControls } from './movie-detail/types'
import {
  nextEpisode,
  previousEpisode,
  isFirstEpisode,
  isLastEpisode,
  type EpisodePosition,
} from '@/lib/episodeNavigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  // Picks between two genuinely different pre-play layouts. Only the chosen
  // one is mounted: rendering both and hiding one with CSS would duplicate
  // every control on the screen (two Play buttons, two server pickers).
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [embedUrl, setEmbedUrl] = useState('')
  const [server, setServer] = useState(() => {
    return initialServer || CONFIG.DEFAULT_PROVIDER
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

  // Save mid-watch progress (0.5) when the user leaves after >= 30s
  const handleClose = () => {
    if (isPlaying && watchStartTimeRef.current) {
      const elapsed = Date.now() - watchStartTimeRef.current
      if (elapsed >= 30_000) {
        saveProgress(season, episode, 0.5)
      }
    }
    onClose()
  }

  useEffect(() => {
    if (isPlaying) {
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

    // Clear any existing start timer
    if (startSaveTimerRef.current) clearTimeout(startSaveTimerRef.current)

    startSaveTimerRef.current = setTimeout(() => {
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

  const iframeRef = useRef<HTMLIFrameElement>(null)

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

  // --- RENDER ---
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background text-foreground font-sans overflow-hidden"
      >
        {/* ── Ambient Background (always fixed, never scrolls) ── */}
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <picture>
            {/* A 16:9 backdrop cropped to a portrait phone is mostly sky and
                shoulders — the poster is the art that was composed for it.
                Declared as an override so the <img> keeps the backdrop as its
                own src, which is what non-picture-aware consumers read. */}
            <source media="(max-width: 767px)" srcSet={posterImage} />
            <img
              src={heroImage}
              alt={title}
              className={cn(
                // Capped to the top of the screen on mobile: stretching a 2:3
                // poster over a 0.46:1 viewport crops ~45% of its width away
                // and blows the rest up past its own resolution.
                "w-full h-[58svh] object-cover object-top md:h-full md:object-center transition-all duration-[1500ms] ease-in-out",
                isPlaying
                  ? "scale-110 opacity-15 blur-[40px]"
                  : "scale-100 opacity-100 blur-0 md:opacity-55"
              )}
            />
          </picture>
          {/* Portrait scrim: art up top, solid background where the sheet sits */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background md:bg-gradient-to-t md:from-background md:via-background/80 md:to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent opacity-80 max-md:hidden" />
        </div>

        {/* ── Top Navigation (always visible, non-scrolling) ── */}
        <div className={cn(
          "absolute top-0 left-0 right-0 px-4 py-4 md:px-10 md:py-6 flex justify-between items-center z-[100] pointer-events-none transition-opacity duration-300 max-md:pt-[calc(1rem+env(safe-area-inset-top,0px))]",
          // The takeover player draws its own back control over the video
          isPlaying ? "player-hide-chrome" : "opacity-100"
        )}>
          <button
            onClick={handleClose}
            aria-label="Back"
            className="pointer-events-auto flex items-center gap-2 text-sm font-medium tracking-widest uppercase text-white/70 hover:text-white transition-colors group"
          >
            <div className="p-2.5 md:p-3 rounded-full border border-white/20 group-hover:border-white/50 transition-colors backdrop-blur-sm bg-black/40">
              <ChevronLeft className="w-5 h-5" />
            </div>
            <span className="hidden text-base md:inline">Back</span>
          </button>
          <div className="flex gap-2 md:gap-4 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const genreIds = genreIdsOf(initialMedia);
                toggleFavorite(initialMedia.id, typedMode, genreIds);
              }}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorited}
              className="p-2.5 md:p-3 rounded-full border border-white/20 hover:border-white/50 transition-colors backdrop-blur-sm text-foreground/70 hover:text-foreground bg-background/40 group cursor-pointer tap-scale"
            >
              <Heart className={cn('w-5 h-5 md:w-6 md:h-6 transition-colors', favorited ? 'fill-red-500 text-red-500' : 'group-hover:text-red-500')} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleShare()
              }}
              aria-label={isCopied ? 'Link copied' : 'Copy share link'}
              className="p-2.5 md:p-3 rounded-full border border-white/20 hover:border-white/50 transition-colors backdrop-blur-sm text-foreground/70 hover:text-foreground bg-background/40 cursor-pointer tap-scale"
            >
              {isCopied ? <Check className="w-5 h-5 md:w-6 md:h-6 text-green-500" /> : <Share2 className="w-5 h-5 md:w-6 md:h-6" />}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            LAYER 1 — PRE-PLAY: full-screen, no scroll
            ══════════════════════════════════════════ */}
        {!isPlaying && (isMobile ? (
          /* Mobile — scrollable sheet over the artwork */
          <div
            data-lenis-prevent
            className="absolute inset-0 z-10 overflow-y-auto overscroll-contain custom-scrollbar"
          >
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
            <div className="mt-auto w-full max-w-[1500px] mx-auto px-6 md:px-16 lg:px-24 pb-12">
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
            LAYER 2 — THEATER MODE: scrollable
            ══════════════════════════════════════════ */}
        {isPlaying && (
          <div
            ref={scrollRef}
            data-lenis-prevent
            className="absolute inset-0 z-10 overflow-x-hidden overflow-y-auto custom-scrollbar max-md:overflow-hidden max-md:bg-black"
          >
            <div className="w-full max-w-[1500px] mx-auto px-4 pt-20 pb-8 max-md:px-0 max-md:pt-0 max-md:pb-0 md:px-12 lg:px-24 md:pt-24 md:pb-16">
              <AnimatePresence>
                <motion.div
                  key="theater"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full flex flex-col gap-0 md:gap-6"
                >
                  {/*
                    Video Player.

                    One iframe for every viewport — the container is what
                    changes. On md+ it's an inline 16:9 card; below md the
                    `.player-shell` class takes the whole screen (portrait:
                    frame centred on black, landscape: edge to edge). The old
                    build faked landscape by rotating the frame 90°, which
                    broke native fullscreen, put the provider's own controls
                    sideways, and left tap coordinates transposed.
                  */}
                  <div className={cn(
                    "w-full bg-black relative overflow-hidden player-shell",
                    "aspect-video md:bg-card rounded-xl md:rounded-2xl shadow-2xl md:shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/5",
                    "max-md:aspect-auto max-md:rounded-none max-md:border-0 max-md:shadow-none"
                  )}>
                    {/* Player chrome — back out of playback without leaving the title */}
                    <div className="player-chrome-top pointer-events-none absolute inset-x-0 top-0 z-[110] items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
                      <button
                        onClick={() => setIsPlaying(false)}
                        aria-label="Back to details"
                        className="pointer-events-auto rounded-full border border-white/20 bg-black/50 p-2.5 text-white/80 backdrop-blur-md tap-scale"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">
                        {title}
                        {mode === 'tv' && (
                          <span className="ml-2 font-normal text-white/50">S{season}:E{episode}</span>
                        )}
                      </span>
                    </div>

                    <div className="player-frame">
                    {embedUrl ? (
                      <>
                        <iframe
                          ref={iframeRef}
                          src={embedUrl}
                          className="absolute inset-0 w-full h-full"
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
                          <div className="absolute inset-0 flex items-center justify-center bg-black pointer-events-none">
                            <Loader2 className="w-10 h-10 text-white/30 animate-spin" />
                          </div>
                        )}
                        {showStallPrompt && !playbackStarted && (
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2.5 text-sm text-white/80 shadow-2xl">
                            <span>This server is taking a while…</span>
                            <button
                              onClick={openServerPicker}
                              className="font-semibold text-primary hover:text-primary/80 transition-colors"
                            >
                              Try another server
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Play className="w-24 h-24 text-white/10" />
                      </div>
                    )}
                    </div>

                    {/*
                      Portrait controls. In portrait the 16:9 frame only uses
                      about a third of the screen, so episode navigation and
                      the server picker live in the space under it instead of
                      being buried a screen away. Rotating hides them and the
                      video takes over — see .player-chrome-portrait.
                    */}
                    <div
                      /* In flow rather than pinned to the bottom: the shell
                         centres its children, so frame + controls read as one
                         group instead of being split by a void of black. */
                      className="player-chrome-portrait z-[110] w-full px-5 pt-6"
                    >
                      {mode === 'tv' && (
                        <div className="mb-4 flex items-center justify-center gap-6">
                          <button
                            onClick={handleSkipPrev}
                            disabled={isAtAbsoluteFirstEpisode}
                            aria-label="Previous episode"
                            className="rounded-full border border-white/15 bg-white/[0.06] p-3.5 text-white disabled:opacity-25 tap-scale"
                          >
                            <SkipBack className="h-5 w-5" />
                          </button>
                          <span className="min-w-[92px] text-center text-sm font-semibold text-white/80">
                            S{season} · E{episode}
                          </span>
                          <button
                            onClick={handleSkipNext}
                            disabled={isAtAbsoluteLastEpisode}
                            aria-label="Next episode"
                            className="rounded-full border border-white/15 bg-white/[0.06] p-3.5 text-white disabled:opacity-25 tap-scale"
                          >
                            <SkipForward className="h-5 w-5" />
                          </button>
                        </div>
                      )}

                      <Select value={server} onValueChange={setServer}>
                        <SelectTrigger ref={mobileServerSelectTriggerRef} className="h-12 w-full rounded-lg border-white/10 bg-white/[0.07] text-sm text-white/80">
                          <div className="flex items-center gap-2">
                            <Server className="h-3.5 w-3.5 shrink-0 text-white/40" />
                            <SelectValue placeholder="Server" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[50vh] rounded-xl border-border/60 bg-popover text-popover-foreground shadow-2xl custom-scrollbar">
                          {Object.entries(CONFIG.PROVIDER_NAMES).map(([key, name]) => (
                            <SelectItem key={key} value={key} className="py-3 text-[15px]">{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <p className="mt-3 text-center text-[11px] text-white/35">
                        Rotate your phone for full-width playback
                      </p>
                    </div>
                  </div>

                  {/* Command Center — mobile drives playback from the player
                      shell's own controls, which sit over this */}
                  {!isMobile && (
                    <div className="w-full bg-card/90 p-5 md:p-6 border border-border/30 rounded-2xl shadow-2xl">
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                        {/* Left: TV navigation or movie title */}
                        {mode === 'tv' ? (
                          <div className="flex items-center gap-6 w-full lg:w-auto">
                            <div className="flex items-center gap-2 bg-black/40 rounded-full p-1.5 border border-white/5 shrink-0">
                              <button
                                onClick={handleSkipPrev}
                                disabled={isAtAbsoluteFirstEpisode}
                                className="p-3 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                              >
                                <SkipBack className="w-5 h-5" />
                              </button>
                              <div className="w-px h-6 bg-white/10" />
                              <button
                                onClick={handleSkipNext}
                                disabled={isAtAbsoluteLastEpisode}
                                className="p-3 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                              >
                                <SkipForward className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-xs text-primary uppercase tracking-widest font-bold mb-1">Season {season} • Episode {episode}</span>
                              <span className="block text-lg font-medium text-white/90 truncate">{title}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="block text-xs text-primary uppercase tracking-widest font-bold mb-1">Now Playing</span>
                            <span className="block text-lg font-medium text-white/90 truncate">{title}</span>
                          </div>
                        )}

                        {/* Right: Server selector */}
                        <div className="flex flex-col lg:items-end gap-2 shrink-0 z-[60] w-full lg:w-auto">
                          <div className="flex items-center gap-2 px-2">
                            <Server className="w-3.5 h-3.5 text-white/40" />
                            <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Streaming Server</span>
                          </div>
                          <Select value={server} onValueChange={setServer}>
                            <SelectTrigger ref={serverSelectTriggerRef} className="w-full lg:w-64 bg-black/40 backdrop-blur-md border-white/5 text-white h-12 rounded-xl text-base font-medium hover:bg-white/10 transition-colors">
                              <SelectValue placeholder="Select Server" />
                            </SelectTrigger>
                            <SelectContent className="border-border/60 bg-popover text-popover-foreground rounded-xl overflow-hidden shadow-2xl">
                              {Object.entries(CONFIG.PROVIDER_NAMES).map(([key, name]) => (
                                <SelectItem key={key} value={key} className="cursor-pointer focus:bg-white/10 py-3 text-base">{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────
                      DETAILS RENDERED BELOW THE PLAYER
                      ───────────────────────────────────────────── */}
                  {!isMobile && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                    >
                      <DetailPanel
                        display={display}
                        playback={playbackControls}
                        isPrePlay={false}
                        isLiked={isLiked}
                        onToggleLike={handleLikeToggle}
                        disliked={disliked}
                        onToggleDislike={() => toggleDislike(initialMedia.id, typedMode)}
                      />
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
