import { useState, useEffect, useCallback, useMemo } from 'react'
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
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth0 } from '@auth0/auth0-react'

interface PlayerModalProps {
  media: Media | null
  mode: MediaMode
  isOpen: boolean
  onClose: () => void
  initialSeason?: number
  initialEpisode?: number
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
}: PlayerModalProps) {
  const [provider, setProvider] = useState('vidsrc_pro')
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
      setIsPlaying(false)
      setEmbedUrl('')
      setProvider('vidsrc_pro')
      setSeason(initialSeason || 1)
      setEpisode(initialEpisode || 1)
      setStreamError(false)
      setIsLoading(false)
      document.body.style.overflow = 'hidden'

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

  /* ================= EPISODE COUNT UPDATE ================= */

  useEffect(() => {
    const currentSeason = seasons.find((s) => s.season_number === season)
    if (currentSeason) {
      setCurrentSeasonEpisodes(currentSeason.episode_count)
    }
  }, [season, seasons])

  /* ================= CONTINUE WATCHING HEARTBEAT ================= */

  useEffect(() => {
    if (!isPlaying || !media || !isAuthenticated) return

    const interval = setInterval(async () => {
      try {
        const token = await getAccessTokenSilently()

        await updateContinueWatching(token, {
          tmdbId: media.id,
          mediaType: mode === 'tv' ? 'tv' : 'movie',
          season: mode === 'tv' ? season : undefined,
          episode: mode === 'tv' ? episode : undefined,
          progress: 0.5,
        })
      } catch (err) {
        console.error('Failed to update continue watching:', err)
      }
    }, 60000) // 🔥 Reduced from 30s to 60s for better performance (50% less backend load)

    return () => clearInterval(interval)
  }, [
    isPlaying,
    media,
    season,
    episode,
    mode,
    isAuthenticated,
    getAccessTokenSilently,
  ])

  /* ================= FAST CLOSE (ONLY CHANGE MADE HERE) ================= */

  const handleSmartClose = useCallback(() => {
    // 1️⃣ Close modal immediately (NO async here)
    onClose()

    // 2️⃣ Save resume in background (fire-and-forget)
    if (!media || !isAuthenticated) return

    setTimeout(async () => {
      try {
        const token = await getAccessTokenSilently()
        const mediaType = mode === 'tv' ? 'tv' : 'movie'

        let nextProgress = 0.5 // Default for TV

        if (mode === 'movie') {
          const existing = await fetchExistingProgress(token, media.id, mediaType)

          if (!existing) {
            nextProgress = 0.1
          } else if (existing.progress < 0.5) {
            nextProgress = 0.5
          } else {
            nextProgress = 0.9
          }
        }

        await updateContinueWatching(token, {
          tmdbId: media.id,
          mediaType,
          season: mode === 'tv' ? season : undefined,
          episode: mode === 'tv' ? episode : undefined,
          progress: nextProgress,
        })

        if (nextProgress >= 0.95) {
          await removeContinueWatching(token, media.id, mediaType)
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
    setShowProviderDropdown(false)
    setStreamError(false)
    setIsLoading(true)

    if (isPlaying && media) {
      const url = buildEmbedUrl(mode, newProvider, media.id, {
        season,
        episode,
        malId,
        subOrDub,
      })
      setEmbedUrl(url)
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
            rounded-full bg-secondary/80
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
                  rounded-full border border-border
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
        <div className="p-4 sm:p-6">
          {!isPlaying ? (
            /* ===== PRE-PLAY UI ===== */
            <div className="space-y-6">
              {mode === 'tv' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Season */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">
                        Season
                      </label>
                      <select
                        value={season}
                        onChange={(e) => setSeason(Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3"
                      >
                        {seasons.length > 0
                          ? seasons.map((s) => (
                              <option
                                key={s.season_number}
                                value={s.season_number}
                              >
                                Season {s.season_number} ({s.episode_count} eps)
                              </option>
                            ))
                          : Array.from({ length: 10 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                Season {i + 1}
                              </option>
                            ))}
                      </select>
                    </div>

                    {/* Episode */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">
                        Episode
                      </label>
                      <select
                        value={episode}
                        onChange={(e) => setEpisode(Number(e.target.value))}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3"
                      >
                        {Array.from(
                          { length: currentSeasonEpisodes },
                          (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              Episode {i + 1}
                            </option>
                          )
                        )}
                      </select>
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
                  rounded-full bg-gradient-primary py-4
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
              {mode === 'tv' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevEpisode}
                      disabled={season === 1 && episode === 1}
                      className="rounded-full bg-secondary px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="rounded-full bg-primary/20 px-4 py-2 text-sm font-bold text-primary">
                      S{season} E{episode}
                    </span>

                    <button
                      onClick={handleNextEpisode}
                      className="rounded-full bg-secondary px-3 py-2 text-sm"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {autoPlay && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <SkipForward className="h-3 w-3" />
                      Auto
                    </div>
                  )}
                </div>
              )}

                    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black relative">
                      {/* Loading overlay removed per user request */}

                      {streamError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                          <div className="text-center space-y-4 p-6 max-w-md">
                            <div className="text-destructive text-4xl">⚠️</div>
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
          )}
        </div>
      </div>
    </div>
  )
}
