import React, { useEffect, useState, useRef } from 'react'
import { Play, Clock, Calendar, ChevronLeft, Share2, Heart, ThumbsUp, ThumbsDown, Server, SkipForward, SkipBack } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Lenis from '@studio-freight/lenis'
import { CircularRating } from './CircularRating'
import { Media, MediaMode, CONFIG } from '@/lib/config'
import { fetchMediaDetails, getImageUrl, fetchTVSeasons, buildEmbedUrl } from '@/lib/api'
import { useAuth0 } from '@auth0/auth0-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useDislikes } from '@/context/DislikesContext'
import { cn } from '@/lib/utils'
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
  const [media, setMedia] = useState<Media>(initialMedia)
  const [isLoading, setIsLoading] = useState(true)

  const [season, setSeason] = useState(initialSeason || 1)
  const [episode, setEpisode] = useState(initialEpisode || 1)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState(10)

  const [isPlaying, setIsPlaying] = useState(autoPlay || false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [embedUrl, setEmbedUrl] = useState('')
  const [server, setServer] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 850
    return initialServer || (isMobile ? 'vidfast_pro' : 'vidsrc_pro')
  })

  const { isAuthenticated } = useAuth0()
  const { toggleFavorite, isFavorited } = useFavorites()
  const { toggleDislike, isDisliked } = useDislikes()
  const [isLiked, setIsLiked] = useState(false)

  const typedMode = mode as 'movie' | 'tv'
  const favorited = isFavorited(initialMedia.id, typedMode)
  const disliked = isDisliked(initialMedia.id, typedMode)

  useEffect(() => {
    if (isPlaying) {
      const url = buildEmbedUrl(mode, server, media.id, { season, episode, media })
      setEmbedUrl(url)
    }
  }, [isPlaying, server, media, mode, season, episode])

  // Lock body scroll
  useEffect(() => {
    const prev = window.getComputedStyle(document.body).overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Lenis physics scroll for theater mode container
  const iframeRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return

    const lenis = new Lenis({
      wrapper: scrollRef.current,
      content: scrollRef.current.firstElementChild as HTMLElement,
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.1,
      syncTouch: false,
      touchMultiplier: 2,
    })

    let rafId: number
    function raf(time: number) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [isPlaying])

  useEffect(() => {
    if (mode === 'tv') {
      const timer = setTimeout(() => {
        fetchTVSeasons(initialMedia.id).then((data) => {
          setSeasons(data)
          if (data.length > 0) {
            const firstSeason = data.find((s) => s.season_number === 1) || data[0]
            setCurrentSeasonEpisodes(firstSeason.episode_count || 10)
            setSeason(firstSeason.season_number)
          }
        }).catch((err) => {
          console.error('Failed to fetch seasons:', err)
          setSeasons([])
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [initialMedia.id, mode])

  useEffect(() => {
    const currentSeason = seasons.find((s) => s.season_number === season)
    if (currentSeason) setCurrentSeasonEpisodes(currentSeason.episode_count)
  }, [season, seasons])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    fetchMediaDetails(mode, initialMedia.id).then(details => {
      if (isMounted && details) setMedia(prev => ({ ...prev, ...details }))
      setIsLoading(false)
    }).catch(err => {
      console.error(err)
      setIsLoading(false)
    })
    return () => { isMounted = false }
  }, [initialMedia.id, mode])

  const title = media.title || media.name || 'Unknown'
  const subtitle = media.tagline || ''
  const description = media.overview || 'No description available.'
  const rating = media.vote_average || 0
  const match = (rating * 10).toFixed(0) + '%'
  const year = (media.release_date || media.first_air_date || '').split('-')[0] || ''

  let contentRating = 'NR'
  if (mode === 'movie' || media.media_type === 'movie') {
    if (media.release_dates?.results) {
      const usRelease = media.release_dates.results.find((r: any) => r.iso_3166_1 === 'US')
      if (usRelease && usRelease.release_dates.length > 0) {
        const cert = usRelease.release_dates.find((d: any) => d.certification)?.certification
        if (cert) contentRating = cert
      }
    }
  } else {
    if (media.content_ratings?.results) {
      const usRating = media.content_ratings.results.find((r: any) => r.iso_3166_1 === 'US')
      if (usRating && usRating.rating) {
        contentRating = usRating.rating
      }
    }
  }

  let durationStr = ''
  if (media.runtime) {
    const hours = Math.floor(media.runtime / 60)
    const mins = media.runtime % 60
    durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  } else if (media.number_of_seasons) {
    durationStr = `${media.number_of_seasons} Season${media.number_of_seasons > 1 ? 's' : ''}`
  }

  const genres = media.genres ? media.genres.map(g => g.name) : []
  const director = media.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Unknown'
  const cast = media.credits?.cast?.slice(0, 4).map(c => ({
    name: c.name,
    role: c.character,
    image: getImageUrl(c.profile_path, 'thumbnail')
  })) || []

  const heroImage = getImageUrl(media.backdrop_path, 'backdrop')

  const logos = media.images?.logos || []
  let logoImage = null
  if (logos.length > 0) {
    const enLogo = logos.find((l: any) => l.iso_639_1 === 'en')
    const noLangLogo = logos.find((l: any) => !l.iso_639_1)
    logoImage = enLogo ? getImageUrl(enLogo.file_path, 'logo')
               : (noLangLogo ? getImageUrl(noLangLogo.file_path, 'logo') : getImageUrl(logos[0].file_path, 'logo'))
  }

  // Helper to render the details grid for both views
  const renderDetails = (isPrePlay: boolean) => (
    <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-20 items-end", !isPrePlay && "mt-12 mb-16 px-2")}>
      {/* Left — Details */}
      {!isLoading && (
        <div className="lg:col-span-7 space-y-6">
          {/* Title / Logo */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.7, ease: 'easeOut' }}
          >
            {logoImage ? (
              <img
                src={logoImage}
                alt={title}
                aria-hidden="true"
                className="max-h-[120px] md:max-h-[160px] lg:max-h-[180px] w-auto object-contain mb-6 drop-shadow-2xl"
                draggable="false"
                role="presentation"
              />
            ) : (
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif leading-tight tracking-tight mb-4">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-lg md:text-xl lg:text-2xl text-primary font-light tracking-wide italic font-serif">
                {subtitle}
              </p>
            )}
          </motion.div>

          {/* Metadata & Rating */}
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="flex flex-wrap items-center gap-6"
          >
            <div className="flex items-center gap-4">
              <CircularRating rating={rating} />
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-widest text-white/50 font-semibold">Score</span>
                <span className="text-sm md:text-base font-medium text-white/90">{match} Match</span>
              </div>
            </div>
            <div className="h-8 w-px bg-white/20 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-5 text-sm md:text-base font-medium text-white/70 tracking-wide">
              {year && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{year}</span>
                </div>
              )}
              {durationStr && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{durationStr}</span>
                </div>
              )}
              <div className="px-2.5 py-1 border border-white/20 rounded text-xs tracking-widest uppercase bg-white/5">
                {contentRating}
              </div>
            </div>
          </motion.div>

          {/* Genres */}
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.7 }}
            className="flex flex-wrap gap-3"
          >
            {genres.slice(0, 4).map(genre => (
              <span key={genre} className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-sm border border-white/10 text-white/80">
                {genre}
              </span>
            ))}
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.7 }}
            className="text-base md:text-lg lg:text-xl text-white/60 leading-relaxed max-w-2xl font-light line-clamp-4 lg:line-clamp-none"
          >
            {description}
          </motion.p>

          {/* Pre-Play Selectors + Actions (Only in Layer 1) */}
          {isPrePlay && (
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.7 }}
              className="space-y-4 pt-2"
            >
              {mode === 'tv' && (
                <div className="flex flex-wrap gap-3">
                  <div className="w-40 z-[60]">
                    <Select value={season.toString()} onValueChange={(val) => { setSeason(Number(val)); setEpisode(1) }}>
                      <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 backdrop-blur-md rounded-xl hover:bg-white/10 transition-colors text-sm font-medium">
                        <SelectValue placeholder="Season" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] border-white/10 bg-[#0A0A0A] text-white rounded-xl shadow-2xl custom-scrollbar">
                        {seasons.length > 0
                          ? seasons.map(s => <SelectItem key={s.season_number} value={s.season_number.toString()} className="cursor-pointer focus:bg-white/10 py-2.5">Season {s.season_number}</SelectItem>)
                          : Array.from({ length: 10 }, (_, i) => <SelectItem key={i + 1} value={(i + 1).toString()} className="cursor-pointer focus:bg-white/10 py-2.5">Season {i + 1}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40 z-[60]">
                    <Select value={episode.toString()} onValueChange={(val) => setEpisode(Number(val))}>
                      <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 backdrop-blur-md rounded-xl hover:bg-white/10 transition-colors text-sm font-medium">
                        <SelectValue placeholder="Episode" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] border-white/10 bg-[#0A0A0A] text-white rounded-xl shadow-2xl custom-scrollbar">
                        {Array.from({ length: currentSeasonEpisodes }, (_, i) => <SelectItem key={i + 1} value={(i + 1).toString()} className="cursor-pointer focus:bg-white/10 py-2.5">Episode {i + 1}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Actions row — clean, minimalistic */}
              <div className="flex items-center gap-3">
                {/* Play Now — primary CTA */}
                <button
                  onClick={() => setIsPlaying(true)}
                  className="flex items-center gap-2.5 bg-white text-black px-8 py-3 rounded-full font-semibold text-base hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Play Now
                </button>

                {/* Server selector — ghost style */}
                <div className="w-48 z-[60]">
                  <Select value={server} onValueChange={setServer}>
                    <SelectTrigger className="w-full bg-white/[0.06] border-white/[0.08] text-white/80 h-11 backdrop-blur-md rounded-full hover:bg-white/10 transition-colors text-sm">
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-white/40 shrink-0" />
                        <SelectValue placeholder="Server" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#0A0A0A] text-white rounded-xl shadow-2xl custom-scrollbar">
                      {Object.entries(CONFIG.PROVIDER_NAMES).map(([key, name]) => (
                        <SelectItem key={key} value={key} className="cursor-pointer focus:bg-white/10 py-2.5 text-sm">{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-white/10" />

                {/* Like / Dislike — icon-only ghost buttons */}
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={cn(
                    'p-2.5 rounded-full border transition-all',
                    isLiked
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                  )}
                >
                  <ThumbsUp className={cn('w-4 h-4', isLiked && 'fill-current')} />
                </button>
                <button
                  onClick={() => toggleDislike(initialMedia.id, typedMode)}
                  className={cn(
                    'p-2.5 rounded-full border transition-all',
                    disliked
                      ? 'border-red-500/60 bg-red-500/10 text-red-400'
                      : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                  )}
                >
                  <ThumbsDown className={cn('w-4 h-4', disliked && 'fill-current')} />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Right — Cast & Crew */}
      {!isLoading && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="lg:col-span-5 space-y-8 pb-4"
        >
          {mode === 'movie' && (
            <div className="border-l-2 border-primary/50 pl-5">
              <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2 font-semibold">Director</h3>
              <p className="text-xl font-medium tracking-wide">{director}</p>
            </div>
          )}
          {cast.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Top Cast</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cast.map((actor, idx) => (
                  <motion.div
                    key={actor.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + idx * 0.08 }}
                    className="flex items-center gap-4 group cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <div className="relative overflow-hidden rounded-full w-14 h-14 shrink-0">
                      <img src={actor.image} alt={actor.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 border border-white/10 rounded-full group-hover:border-primary/50 transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-white/85 group-hover:text-white transition-colors truncate">{actor.name}</p>
                      <p className="text-sm text-white/40 truncate">{actor.role}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )

  // --- RENDER ---
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#050505] text-white font-sans overflow-hidden"
      >
        {/* ── Ambient Background (always fixed, never scrolls) ── */}
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <motion.img
            animate={{
              scale: isPlaying ? 1.1 : 1,
              opacity: isPlaying ? 0.12 : 0.55,
              filter: isPlaying ? 'blur(40px)' : 'blur(0px)'
            }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            src={heroImage}
            alt={title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-[#050505]/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent opacity-80" />
        </div>

        {/* ── Top Navigation (always visible, non-scrolling) ── */}
        <div className="absolute top-0 left-0 right-0 px-6 py-5 md:px-10 md:py-6 flex justify-between items-center z-50 pointer-events-none">
          <button
            onClick={onClose}
            className="pointer-events-auto flex items-center gap-2 text-sm font-medium tracking-widest uppercase text-white/70 hover:text-white transition-colors group"
          >
            <div className="p-3 rounded-full border border-white/20 group-hover:border-white/50 transition-colors backdrop-blur-sm bg-black/20">
              <ChevronLeft className="w-5 h-5" />
            </div>
            <span className="text-base">Back</span>
          </button>
          <div className="flex gap-4 pointer-events-auto">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(initialMedia.id, typedMode) }}
              className="p-3 rounded-full border border-white/20 hover:border-white/50 transition-colors backdrop-blur-sm text-white/70 hover:text-white bg-black/20 group cursor-pointer"
            >
              <Heart className={cn('w-6 h-6 transition-colors', favorited ? 'fill-red-500 text-red-500' : 'group-hover:text-red-500')} />
            </button>
            <button className="p-3 rounded-full border border-white/20 hover:border-white/50 transition-colors backdrop-blur-sm text-white/70 hover:text-white bg-black/20">
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            LAYER 1 — PRE-PLAY: full-screen, no scroll
            ══════════════════════════════════════════ */}
        {!isPlaying && (
          <div className="absolute inset-0 z-10 flex flex-col overflow-hidden">
            {/* Content anchored to bottom of screen */}
            <div className="mt-auto w-full max-w-[1500px] mx-auto px-6 md:px-16 lg:px-24 pb-12">
              {renderDetails(true)}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            LAYER 2 — THEATER MODE: scrollable
            ══════════════════════════════════════════ */}
        {isPlaying && (
          <div
            ref={scrollRef}
            className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden custom-scrollbar"
          >
            <div className="w-full max-w-[1500px] mx-auto px-6 md:px-12 lg:px-24 pt-24 pb-16">
              <AnimatePresence>
                <motion.div
                  key="theater"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full flex flex-col gap-6"
                >
                  {/* Video Player */}
                  <div className="w-full aspect-video bg-[#0a0a0a] rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/5 relative">
                    {embedUrl ? (
                      <iframe
                        ref={iframeRef}
                        src={embedUrl}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer *; autoplay *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; fullscreen *; web-share *"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Play className="w-24 h-24 text-white/10" />
                      </div>
                    )}
                  </div>

          {/* Command Center */}
                  <div className="w-full bg-[#111111] border border-white/[0.07] rounded-2xl p-5 md:p-6 shadow-2xl">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      {/* Left: TV navigation or movie title */}
                      {mode === 'tv' ? (
                        <div className="flex items-center gap-6 w-full lg:w-auto">
                          <div className="flex items-center gap-2 bg-black/40 rounded-full p-1.5 border border-white/5 shrink-0">
                            <button
                              onClick={() => setEpisode(Math.max(1, episode - 1))}
                              disabled={episode <= 1}
                              className="p-3 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                            >
                              <SkipBack className="w-5 h-5" />
                            </button>
                            <div className="w-px h-6 bg-white/10" />
                            <button
                              onClick={() => setEpisode(Math.min(currentSeasonEpisodes, episode + 1))}
                              disabled={episode >= currentSeasonEpisodes}
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
                          <SelectTrigger className="w-full lg:w-64 bg-black/40 backdrop-blur-md border-white/5 text-white h-12 rounded-xl text-base font-medium hover:bg-white/10 transition-colors">
                            <SelectValue placeholder="Select Server" />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-[#0A0A0A] text-white rounded-xl overflow-hidden shadow-2xl">
                            {Object.entries(CONFIG.PROVIDER_NAMES).map(([key, name]) => (
                              <SelectItem key={key} value={key} className="cursor-pointer focus:bg-white/10 py-3 text-base">{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* ─────────────────────────────────────────────
                      DETAILS RENDERED BELOW THE PLAYER
                      ───────────────────────────────────────────── */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    {renderDetails(false)}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
