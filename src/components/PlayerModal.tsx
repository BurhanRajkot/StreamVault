import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  X,
  Play,
  Server,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SkipForward,
} from 'lucide-react'
import { Media, MediaMode, CONFIG } from '@/lib/config'
import {
  buildEmbedUrl,
  fetchTVSeasons,
  updateContinueWatching,
  removeContinueWatching,
  fetchExistingProgress,
  saveGuestProgress,
  getGuestItemProgress,
  removeGuestProgress,
  logRecommendationInteraction,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth0 } from '@auth0/auth0-react'
// framer-motion removed - not used in this component
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PlayerModalProps {
  media: Media | null
  mode: MediaMode
  isOpen: boolean
  onClose: () => void
  initialSeason?: number
  initialEpisode?: number
  initialServer?: string
}

interface Season {
  season_number: number
  episode_count: number
  name: string
}

export function PlayerModal({
  media,
  mode,
  isOpen,
  onClose,
  initialSeason,
  initialEpisode,
  initialServer,
}: PlayerModalProps) {
  const [provider, setProvider] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 850;
    return initialServer || (isMobile ? 'vidfast_pro' : 'vidsrc_pro');
  })
  const [season, setSeason] = useState(initialSeason || 1)
  const [episode, setEpisode] = useState(initialEpisode || 1)
  const [malId, setMalId] = useState('')
  const [subOrDub, setSubOrDub] = useState('sub')
  const [embedUrl, setEmbedUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState(10)
  const [autoPlay, setAutoPlay] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)

  const { isAuthenticated, getAccessTokenSilently } = useAuth0()

  /* ================= FETCH SEASONS (OPTIMIZED) ================= */

  useEffect(() => {
    if (isOpen && media && mode === 'tv') {
      // Debounce season fetching to avoid rapid API calls
      const timer = setTimeout(() => {
        fetchTVSeasons(media.id).then((data) => {
          setSeasons(data)
          if (data.length > 0) {
            const firstSeason = data.find((s) => s.season_number === 1) || data[0]
            setCurrentSeasonEpisodes(firstSeason.episode_count || 10)
          }
        }).catch((err) => {
          console.error('Failed to fetch seasons:', err)
          // Fallback to default if fetch fails
          setSeasons([])
        })
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [isOpen, media, mode])

  /* ================= MODAL OPEN / CLOSE ================= */

  useEffect(() => {
    if (isOpen) {
      // 1. Initialize State
      // Provider is per-item: use the server saved for THIS specific media item.
      // Falls back to 'vidsrc_pro' if no server was previously saved for it.
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 850;
      const effectiveProvider = initialServer || (isMobile ? 'vidfast_pro' : 'vidsrc_pro')
      setProvider(effectiveProvider)
      setSeason(initialSeason || 1)
      setEpisode(initialEpisode || 1)
      setStreamError(false)
      setIsLoading(false)
      document.body.style.overflow = 'hidden'

      // 2. Auto-Start Playback (ONLY FOR MOVIES)
      if (media && mode === 'movie') {
         // Construct URL immediately
         const startSeason = initialSeason || 1
         const startEpisode = initialEpisode || 1

         const url = buildEmbedUrl(mode, effectiveProvider, media.id, {
           season: startSeason,
           episode: startEpisode,
           malId,
           subOrDub,
           media,
         })

         setEmbedUrl(url)
         setIsPlaying(true)
      } else {
         // For TV shows, we want the user to select season/episode first
         setIsPlaying(false)
         setEmbedUrl('')
         // If initial season/episode provided, set them but don't play yet
         if (initialSeason) setSeason(initialSeason)
         if (initialEpisode) setEpisode(initialEpisode)
      }

      // Add DNS prefetch and preconnect hints for streaming providers
      const head = document.head
      const existingHints = head.querySelectorAll('link[data-streaming-hint]')
      existingHints.forEach(hint => hint.remove())

      CONFIG.STREAMING_DOMAINS.forEach(domain => {
        // DNS prefetch
        const dnsPrefetch = document.createElement('link')
        dnsPrefetch.rel = 'dns-prefetch'
        dnsPrefetch.href = `https://${domain}`
        dnsPrefetch.setAttribute('data-streaming-hint', 'true')
        head.appendChild(dnsPrefetch)

        // Preconnect for faster connection establishment
        const preconnect = document.createElement('link')
        preconnect.rel = 'preconnect'
        preconnect.href = `https://${domain}`
        preconnect.setAttribute('data-streaming-hint', 'true')
        head.appendChild(preconnect)
      })
    } else {
      document.body.style.overflow = ''
      // Clean up hints when modal closes
      const hints = document.head.querySelectorAll('link[data-streaming-hint]')
      hints.forEach(hint => hint.remove())
    }

    return () => {
      document.body.style.overflow = ''
      const hints = document.head.querySelectorAll('link[data-streaming-hint]')
      hints.forEach(hint => hint.remove())
    }
  }, [isOpen, initialSeason, initialEpisode])

  /* ================= MOBILE FULLSCREEN & LANDSCAPE ================= */

  useEffect(() => {
    // Only run if playing and content is present
    if (isPlaying && media) {
      // Check if device is mobile (phone/tablet)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 850

      if (isMobile && playerRef.current) {
        // 1. Request Fullscreen
        const requestFullscreen = async () => {
          try {
            await playerRef.current?.requestFullscreen()

            // 2. Lock Orientation to Landscape (Android/Chrome mostly)
            // @ts-ignore - screen.orientation type definition might be missing
            if (screen.orientation && screen.orientation.lock) {
              // @ts-ignore
              await screen.orientation.lock('landscape').catch(() => {
                // Orientation lock failed (expected on some devices/browsers)
              })
            }
          } catch (err) {
            console.error('Fullscreen request failed:', err)
          }
        }

        requestFullscreen()
      }
    }
  }, [isPlaying, media]) // Runs when isPlaying changes to true

  /* ================= EPISODE COUNT UPDATE ================= */

  useEffect(() => {
    const currentSeason = seasons.find((s) => s.season_number === season)
    if (currentSeason) {
      setCurrentSeasonEpisodes(currentSeason.episode_count)
    }
  }, [season, seasons])

  /* ================= CINEMATCH: LOG WATCH EVENT ================= */

  useEffect(() => {
    // Only fire when playback genuinely starts
    if (!isPlaying || !media || !isAuthenticated) return

    // Fire-and-forget: non-critical, doesn't block UI
    void (async () => {
      try {
        const token = await getAccessTokenSilently()
        const mediaType = (mode === 'tv' ? 'tv' : 'movie') as 'tv' | 'movie'
        await logRecommendationInteraction(token, {
          tmdbId: media.id,
          mediaType,
          eventType: 'watch',
          progress: 0,  // Will be updated by the heartbeat
          selectedServer: provider,
        })
      } catch {
        // Non-critical — never block playback
      }
    })()
  // Only re-run when the playing state flips to true — NOT on every heartbeat tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  /* ================= CONTINUE WATCHING HEARTBEAT ================= */

  useEffect(() => {
    if (!isPlaying || !media) return

    const saveProgress = async () => {
      // Data to save
      const progressData = {
        tmdbId: media.id,
        mediaType: (mode === 'tv' ? 'tv' : 'movie') as 'tv' | 'movie',
        season: mode === 'tv' ? season : undefined,
        episode: mode === 'tv' ? episode : undefined,
        progress: 0.5,
        server: provider,
      }

      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently()
          await updateContinueWatching(token, progressData)

          // Also log to the recommendation engine to build the user's genre/keyword profile
          await logRecommendationInteraction(token, {
            tmdbId: media.id,
            mediaType: progressData.mediaType,
            eventType: 'watch',
            progress: progressData.progress,
            selectedServer: provider,
          })
        } catch (err) {
          console.error('Failed to update continue watching:', err)
        }
      } else {
        // GUEST MODE: Save to localStorage
        saveGuestProgress(progressData)
      }
    }

    const interval = setInterval(saveProgress, 60000) // 60s interval
    return () => clearInterval(interval)
  }, [
    isPlaying,
    media,
    season,
    episode,
    mode,
    provider, // Include provider so heartbeat always saves the current server
    isAuthenticated,
    getAccessTokenSilently,
  ])

  /* ================= FAST CLOSE (ONLY CHANGE MADE HERE) ================= */

  const handleSmartClose = useCallback(() => {
    // 1. Close modal immediately (NO async here)
    onClose()

    // 2. Save resume in background (fire-and-forget)
    if (!media) return

    setTimeout(async () => {
      try {
        const mediaType = (mode === 'tv' ? 'tv' : 'movie') as 'tv' | 'movie'
        let nextProgress = 0.5 // Default for TV

        if (mode === 'movie') {
          let existing: any = null

          if (isAuthenticated) {
            const token = await getAccessTokenSilently()
            existing = await fetchExistingProgress(token, media.id, mediaType)
          } else {
            existing = getGuestItemProgress(media.id, mediaType)
          }

          if (!existing) {
            nextProgress = 0.1
          } else if (existing.progress < 0.5) {
            nextProgress = 0.5
          } else {
            nextProgress = 0.9
          }
        }

        const data = {
          tmdbId: media.id,
          mediaType,
          season: mode === 'tv' ? season : undefined,
          episode: mode === 'tv' ? episode : undefined,
          progress: nextProgress,
          server: provider,
        }

        if (isAuthenticated) {
           const token = await getAccessTokenSilently()
           await updateContinueWatching(token, data)

           // Log final progress to recommendation engine
           await logRecommendationInteraction(token, {
             tmdbId: media.id,
             mediaType: data.mediaType,
             eventType: 'watch',
             progress: data.progress,
             selectedServer: provider,
           })

           if (nextProgress >= 0.95) {
             await removeContinueWatching(token, media.id, mediaType)
           }
        } else {
           // GUEST MODE
           saveGuestProgress(data)
           if (nextProgress >= 0.95) {
             removeGuestProgress(media.id, mediaType)
           }
        }
      } catch (err) {
        console.error('Failed to save resume data:', err)
      }
    }, 0)
  }, [
    media,
    mode,
    season,
    episode,
    isAuthenticated,
    getAccessTokenSilently,
    onClose,
    provider,
  ])

  /* ================= PLAY HELPERS ================= */

  const playEpisode = useCallback(
    async (s: number, ep: number) => {
      if (!media) return

      const url = buildEmbedUrl(mode, provider, media.id, {
        season: s,
        episode: ep,
        malId,
        subOrDub,
        media,
      })

      setStreamError(false)
      setIsLoading(true)
      setEmbedUrl(url)
      setIsPlaying(true)
      setSeason(s)
      setEpisode(ep)

      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently()
          await updateContinueWatching(token, {
            tmdbId: media.id,
            mediaType: 'tv',
            season: s,
            episode: ep,
            progress: 0.5,
            server: provider,
          })
        } catch (err) {
          console.error('Failed to update episode:', err)
        }
      }
    },
    [media, mode, provider, malId, subOrDub, isAuthenticated, getAccessTokenSilently]
  )

  const handlePlay = () => {
    if (!media) return

    const url = buildEmbedUrl(mode, provider, media.id, {
      season,
      episode,
      malId,
      subOrDub,
      media,
    })

    setStreamError(false)
    setIsLoading(true)
    setEmbedUrl(url)
    setIsPlaying(true)
  }

  const handleNextEpisode = () => {
    if (episode < currentSeasonEpisodes) {
      playEpisode(season, episode + 1)
    } else if (season < seasons.length) {
      const nextSeason = seasons.find((s) => s.season_number === season + 1)
      if (nextSeason) {
        playEpisode(season + 1, 1)
      }
    }
  }

  const handlePrevEpisode = () => {
    if (episode > 1) {
      playEpisode(season, episode - 1)
    } else if (season > 1) {
      const prevSeason = seasons.find((s) => s.season_number === season - 1)
      if (prevSeason) {
        playEpisode(season - 1, prevSeason.episode_count)
      }
    }
  }

  const changeSource = (newProvider: string) => {
    setProvider(newProvider)
    // NOTE: We do NOT write to localStorage here.
    // Server preference is per-item and is saved to the database/guest-progress
    // via the heartbeat and handleSmartClose functions.
    setShowProviderDropdown(false)
    setStreamError(false)
    setIsLoading(true)

    if (isPlaying && media) {
      const url = buildEmbedUrl(mode, newProvider, media.id, {
        season,
        episode,
        malId,
        subOrDub,
        media,
      })
      setEmbedUrl(url)

      // LOG: User changed server (strong ML signal for failure of previous server)
      if (isAuthenticated) {
        getAccessTokenSilently().then(token => {
          logRecommendationInteraction(token, {
            tmdbId: media.id,
            mediaType: mode === 'tv' ? 'tv' : 'movie',
            eventType: 'click', // Using click as a proxy for server change
            selectedServer: newProvider,
          }).catch(console.error)
        }).catch(console.error)
      }
    }
  }

  // Memoize providers list to prevent re-creation on every render
  const providers = useMemo(() => Object.entries(CONFIG.PROVIDER_NAMES), [])

  if (!isOpen || !media) return null

  const title = media.title || media.name || 'Unknown'

  /* ================= RENDER ================= */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-md"
        onClick={handleSmartClose}
      />

      {/* Modal */}
      <div
        className="
          relative z-10 w-full max-w-5xl
          bg-card shadow-elevated
          border border-border/50
          max-h-screen sm:max-h-[95vh]
          overflow-y-auto
          rounded-none sm:rounded-2xl
        "
      >
        {/* Close */}
        <button
          onClick={handleSmartClose}
          className="
            absolute right-3 top-3 z-20
            flex h-10 w-10 items-center justify-center
            rounded-lg bg-secondary/80
            text-muted-foreground
            transition-colors
            hover:bg-destructive hover:text-destructive-foreground
            active:scale-95
          "
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="border-b border-border/50 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pr-10">
            <h2 className="text-xl font-bold text-gradient sm:text-2xl">
              {title}
            </h2>

            <div className="relative">
              <button
                onClick={() => setShowProviderDropdown((prev) => !prev)}
                className="
                  flex items-center gap-2
                  rounded-lg border border-border
                  bg-secondary/50 px-4 py-2
                  text-sm font-medium
                  transition-colors hover:border-primary
                  active:scale-95
                "
              >
                <Server className="h-4 w-4 text-primary" />
                <span>{CONFIG.PROVIDER_NAMES[provider]}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    showProviderDropdown && 'rotate-180'
                  )}
                />
              </button>

              {showProviderDropdown && (
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-border bg-popover shadow-lg">
                  {providers.map(([key, name]) => {
                    const metadata = CONFIG.PROVIDER_METADATA[key]
                    return (
                      <button
                        key={key}
                        onClick={() => changeSource(key)}
                        className={cn(
                          'w-full px-4 py-3 text-left transition-colors hover:bg-secondary',
                          provider === key &&
                            'bg-primary/10 text-primary font-medium'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{name}</span>
                          {metadata && (
                            <span className="text-xs opacity-75">{metadata.quality}</span>
                          )}
                        </div>
                        {metadata && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {metadata.description}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-2 sm:p-4 md:p-6">
          {!isPlaying ? (
            /* ===== PRE-PLAY UI ===== */
            <div className="space-y-6">
              {mode === 'tv' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     {/* Season Selector */}
                     <div>
                       <label className="mb-2 block text-sm font-medium text-muted-foreground">
                         Season
                       </label>
                       <Select
                         value={season.toString()}
                         onValueChange={(val) => {
                             setSeason(Number(val))
                             setEpisode(1) // Reset to episode 1 on season change
                         }}
                       >
                         <SelectTrigger className="w-full bg-secondary/50 border-border h-11">
                           <SelectValue placeholder="Select Season" />
                         </SelectTrigger>
                         <SelectContent className="max-h-[300px]">
                            {seasons.length > 0
                              ? seasons.map((s) => (
                                  <SelectItem
                                    key={s.season_number}
                                    value={s.season_number.toString()}
                                    className="cursor-pointer"
                                  >
                                    Season {s.season_number} ({s.episode_count} eps)
                                  </SelectItem>
                                ))
                              : Array.from({ length: 10 }, (_, i) => (
                                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                                    Season {i + 1}
                                  </SelectItem>
                                ))}
                         </SelectContent>
                       </Select>
                     </div>

                     {/* Episode Selector */}
                     <div>
                       <label className="mb-2 block text-sm font-medium text-muted-foreground">
                         Episode
                       </label>
                       <Select
                         value={episode.toString()}
                         onValueChange={(val) => setEpisode(Number(val))}
                       >
                         <SelectTrigger className="w-full bg-secondary/50 border-border h-11">
                           <SelectValue placeholder="Select Episode" />
                         </SelectTrigger>
                         <SelectContent className="max-h-[300px]">
                            {Array.from(
                              { length: currentSeasonEpisodes },
                              (_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>
                                  Episode {i + 1}
                                </SelectItem>
                              )
                            )}
                         </SelectContent>
                       </Select>
                     </div>
                  </div>

                  {/* Autoplay */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAutoPlay(!autoPlay)}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        autoPlay ? 'bg-primary' : 'bg-secondary'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          autoPlay ? 'left-[22px]' : 'left-0.5'
                        )}
                      />
                    </button>
                    <span className="text-sm text-muted-foreground">
                      Auto-play next episode
                    </span>
                  </div>
                </div>
              )}

              {(mode as string) === 'anime' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      MAL ID
                    </label>
                    <input
                      value={malId}
                      onChange={(e) => setMalId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Episode
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={episode}
                      onChange={(e) => setEpisode(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">
                      Type
                    </label>
                    <select
                      value={subOrDub}
                      onChange={(e) => setSubOrDub(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3"
                    >
                      <option value="sub">Sub</option>
                      <option value="dub">Dub</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                onClick={handlePlay}
                className="
                  flex w-full items-center justify-center gap-2
                  rounded-lg bg-gradient-primary py-4
                  font-semibold text-primary-foreground
                  transition-all hover:shadow-glow hover:scale-[1.02]
                  active:scale-95
                "
              >
                <Play className="h-5 w-5 fill-current" />
                {mode === 'tv'
                  ? `Play S${season} E${episode}`
                  : 'Start Playback'}
              </button>
            </div>
          ) : (
            /* ===== PLAYER ===== */
            <div className="space-y-4">
            <div className="space-y-6">
              {/* Controls Bar */}
              {mode === 'tv' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevEpisode}
                      disabled={season === 1 && episode === 1}
                      className="rounded-lg bg-secondary px-3 py-2 text-sm disabled:opacity-50 hover:bg-secondary/80 transition-colors min-w-[44px] min-h-[44px]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-primary">
                      S{season} E{episode}
                    </span>

                    <button
                      onClick={handleNextEpisode}
                      className="rounded-lg bg-secondary px-3 py-2 text-sm hover:bg-secondary/80 transition-colors min-w-[44px] min-h-[44px]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {autoPlay && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/20 px-2 py-1 rounded">
                      <SkipForward className="h-3 w-3" />
                      Auto-play On
                    </div>
                  )}
                </div>
              )}

              {/* Video Player */}
              <div
                ref={playerRef}
                className="aspect-video w-full overflow-hidden rounded-lg border-none bg-black relative shadow-2xl"
                style={{ touchAction: 'none' }}
              >
                {/* Loading overlay removed per user request */}

                {streamError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                    <div className="text-center space-y-4 p-6 max-w-md">
                      <div className="text-destructive text-4xl font-bold">!</div>
                      <h3 className="text-lg font-semibold text-foreground">Stream Unavailable</h3>
                      <p className="text-sm text-muted-foreground">
                        This stream failed to load. Try switching to a different provider or check your connection.
                      </p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => {
                            setStreamError(false)
                            setIsLoading(true)
                            setEmbedUrl(embedUrl + '&retry=' + Date.now())
                          }}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          Retry
                        </button>
                        <button
                          onClick={() => setShowProviderDropdown(true)}
                          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          Change Provider
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <iframe
                  key={embedUrl}
                  src={embedUrl}
                  className="h-full w-full"
                  allowFullScreen
                  allow="accelerometer *; autoplay *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; fullscreen *; web-share *"
                  loading="eager"
                  referrerPolicy="origin"
                  style={{ border: 'none' }}
                  // @ts-ignore - fetchpriority and importance are valid attributes but not in TypeScript types yet
                  fetchpriority="high"
                  importance="high"
                  onLoad={() => {
                    setIsLoading(false)
                    setStreamError(false)
                  }}
                  onError={() => {
                    setIsLoading(false)
                    setStreamError(true)
                    console.error('Stream failed to load:', embedUrl)
                  }}
                />
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
