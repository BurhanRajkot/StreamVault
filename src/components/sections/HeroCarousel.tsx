import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, Pause, Play, Star } from 'lucide-react'
import { Media, MediaMode } from '@/lib/config'
import { fetchMediaDetails, getImageSrcSet, getImageUrl } from '@/lib/api'
import { pickLogo } from '@/lib/mediaDisplay'
import { genreNames } from '@/lib/genres'
import { cn } from '@/lib/utils'

interface HeroCarouselProps {
  items: Media[]
  onMediaClick: (media: Media, season?: number, episode?: number, server?: string, autoPlay?: boolean) => void
}

const INTERVAL_MS = 6000

/**
 * Full-bleed featured carousel (after movy.sx): the title's logo art over the
 * backdrop, a "#N trending" badge, one meta line, Play / More info, and
 * segment indicators with a pause button in the corner.
 */
export function HeroCarousel({ items, onMediaClick }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // progressKey is bumped each time we reset the CSS animation — zero JS ticking
  const [progressKey, setProgressKey] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hiddenRef = useRef(false)
  const userPausedRef = useRef(false)

  const displayItems = items.slice(0, 5)
  const count = displayItems.length

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setProgressKey((k) => k + 1) // restart CSS progress animation
    if (count === 0) return

    intervalRef.current = setInterval(() => {
      if (hiddenRef.current || userPausedRef.current) return
      setCurrentIndex((prev) => (prev + 1) % count)
      setProgressKey((k) => k + 1)
    }, INTERVAL_MS)
  }, [count])

  useEffect(() => {
    startTimer()
    // Pause when tab is hidden to save resources
    const onVisibility = () => { hiddenRef.current = document.hidden }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [startTimer])

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
    startTimer()
  }, [startTimer])

  const togglePaused = () => {
    const next = !userPaused
    userPausedRef.current = next
    setUserPaused(next)
    // Resuming restarts the slide's full interval, so the bar and the timer agree
    if (!next) startTimer()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) {
      goTo(delta > 0 ? (currentIndex + 1) % count : (currentIndex - 1 + count) % count)
    }
    touchStartX.current = null
  }

  // Portrait phones get a tall, poster-led hero (svh so the address bar
  // collapsing doesn't resize it mid-scroll); md+ a near-full-screen banner.
  const heroHeightClass =
    'h-[min(76svh,640px)] min-h-[460px] md:h-[min(88vh,58vw)] md:min-h-[520px]'

  if (items.length === 0) {
    return (
      <section className="relative mb-4" aria-label="Featured content loading">
        <div className={cn('relative overflow-hidden bg-secondary/40 animate-pulse', heroHeightClass)} />
      </section>
    )
  }

  const current = displayItems[currentIndex]

  return (
    <section className="relative mb-4 md:mb-2" aria-label="Featured content carousel">
      {/* Screen reader live region — announces slide changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Slide ${currentIndex + 1} of ${count}: ${current?.title || current?.name || ''}`}
      </div>

      <div
        className={cn('relative isolate overflow-hidden bg-background', heroHeightClass)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 overflow-hidden transition-opacity duration-700 ease-out',
              index === currentIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            {index === currentIndex && <HeroSlide media={item} rank={index + 1} onMediaClick={onMediaClick} />}
          </div>
        ))}
      </div>

      {/* Indicators + pause — bottom right on a wide screen, centred on a phone */}
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 md:bottom-[14%] md:left-auto md:right-[var(--sv-gutter)] md:translate-x-0">
        <div className="flex items-center gap-1.5">
          {displayItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goTo(index)}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === currentIndex ? 'true' : undefined}
              className="group/dot flex h-6 items-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  'relative block h-[3px] overflow-hidden rounded-full transition-all duration-500 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-white',
                  index === currentIndex ? 'w-8 bg-white/30 md:w-10' : 'w-4 bg-white/30 group-hover/dot:bg-white/60 md:w-6'
                )}
              >
                {index === currentIndex && (
                  <span
                    key={progressKey}
                    className="hero-progress-bar absolute inset-y-0 left-0 rounded-full bg-white"
                    style={{ animationPlayState: userPaused ? 'paused' : 'running' }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={togglePaused}
          aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
          className="hidden h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white ring-1 ring-inset ring-white/35 backdrop-blur-sm transition-all hover:bg-white/15 hover:ring-white/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
        >
          {userPaused ? <Play className="ml-0.5 h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
        </button>
      </div>
    </section>
  )
}

function mediaTypeOf(media: Media): 'movie' | 'tv' {
  if (media.media_type === 'movie' || media.media_type === 'tv') return media.media_type
  return media.release_date && !media.first_air_date ? 'movie' : 'tv'
}

interface HeroSlideProps {
  media: Media
  rank: number
  onMediaClick: HeroCarouselProps['onMediaClick']
}

function HeroSlide({ media, rank, onMediaClick }: HeroSlideProps) {
  const title = media.title || media.name || 'Unknown'
  const type = mediaTypeOf(media)
  const rating = media.vote_average ? media.vote_average.toFixed(1) : null
  const year = (media.release_date || media.first_air_date || '').slice(0, 4)
  const genres = genreNames(media.genre_ids, 2)

  // The title's logo art. Same query the title page uses, so opening this
  // title afterwards is instant too.
  const { data: details } = useQuery({
    queryKey: ['mediaDetails', type, String(media.id)],
    queryFn: () => fetchMediaDetails(type as MediaMode, media.id),
    staleTime: 30 * 60 * 1000,
  })
  const logo = details ? pickLogo(details) : null
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = !!logo && !logoFailed

  const backdrop = getImageUrl(media.backdrop_path || media.poster_path, 'hero')
  // Phones are portrait: a 16:9 backdrop cropped to a tall hero loses the
  // subject entirely, so mobile gets the poster art instead.
  const mobileArtPath = media.poster_path || media.backdrop_path

  const play = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMediaClick(media, undefined, undefined, undefined, true)
  }
  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMediaClick(media)
  }

  const heading = (className: string) => (
    <h2 className={className}>
      {showLogo ? (
        <img
          src={logo}
          alt={title}
          onError={() => setLogoFailed(true)}
          className="h-auto max-h-[inherit] w-auto max-w-full object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)]"
        />
      ) : (
        title
      )}
    </h2>
  )

  return (
    // Clicking the art opens the title; keyboard and screen-reader users get
    // the Play / More info buttons (a role="button" wrapper around them would
    // nest interactive controls).
    <div onClick={() => onMediaClick(media)} className="relative h-full w-full cursor-pointer">
      <picture>
        <source media="(max-width: 767px)" srcSet={getImageSrcSet(mobileArtPath, 'poster')} sizes="100vw" />
        <img
          src={backdrop}
          alt=""
          width={1280}
          height={720}
          srcSet={getImageSrcSet(media.backdrop_path || media.poster_path, 'hero')}
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="hero-kenburns absolute inset-0 h-full w-full object-cover object-top md:object-[center_20%]"
        />
      </picture>

      {/* Scrims: header legibility at the top, text on the left, and a fade into the page */}
      <div className="pointer-events-none absolute -inset-x-px -top-px h-40 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute -inset-y-px -left-px hidden bg-gradient-to-r from-black/85 via-black/40 to-transparent md:block md:w-[75%]" />
      <div className="pointer-events-none absolute -inset-x-px -bottom-px h-[55%] bg-gradient-to-t from-background via-background/60 to-transparent md:h-[35%]" />

      {/* ── Phone — centred, thumb-reachable ── */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-10 md:hidden">
        {heading(
          cn(
            'relative max-h-[96px] max-w-[80%] text-center font-extrabold leading-[1.1] text-white drop-shadow-lg',
            showLogo ? 'flex justify-center' : 'line-clamp-2 text-[28px]'
          )
        )}
        <MetaLine rating={rating} year={year} type={type} genres={genres.slice(0, 1)} className="justify-center text-[13px]" />
        <div className="relative flex w-full items-center gap-2.5 pt-1">
          <button
            onClick={play}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-[15px] font-bold text-black tap-scale"
          >
            <Play className="h-[18px] w-[18px] fill-current" />
            Play
          </button>
          <button
            onClick={open}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-white/20 text-[15px] font-semibold text-white backdrop-blur-md tap-scale"
          >
            <Info className="h-[18px] w-[18px]" />
            Info
          </button>
        </div>
      </div>

      {/* ── Wide screens — left column on the page gutter ── */}
      <div className="absolute inset-y-0 left-0 hidden w-full flex-col justify-end px-[var(--sv-gutter)] pb-[12%] md:flex">
        <div className="max-w-[min(46rem,52vw)] space-y-4 lg:space-y-5">
          {heading(
            cn(
              'max-h-[clamp(84px,10vw,170px)] max-w-[min(34rem,40vw)] font-extrabold leading-[1.02] tracking-tight text-white drop-shadow-md',
              showLogo ? 'flex' : 'line-clamp-2 text-[clamp(2.25rem,4vw,4.25rem)]'
            )
          )}

          <div className="flex items-center gap-3 text-white">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-[5px] bg-primary leading-none text-white"
            >
              <span className="text-[7px] font-extrabold tracking-[0.08em]">TOP</span>
              <span className="text-[15px] font-black">10</span>
            </span>
            <span className="text-[clamp(1rem,1.3vw,1.375rem)] font-semibold">
              #{rank} in {type === 'tv' ? 'TV shows' : 'Movies'} today
            </span>
          </div>

          <MetaLine rating={rating} year={year} type={type} genres={genres} className="text-[clamp(0.9375rem,1.05vw,1.125rem)]" />

          {media.overview && (
            <p className="line-clamp-3 max-w-2xl text-[clamp(0.9375rem,1.1vw,1.1875rem)] leading-relaxed text-white/85">
              {media.overview}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={play}
              className="flex h-12 items-center justify-center gap-2.5 rounded-lg bg-white px-7 text-base font-semibold text-black transition-all hover:bg-white/85 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black lg:h-14 lg:px-8 lg:text-lg"
            >
              <Play className="h-5 w-5 fill-current" />
              Play
            </button>
            <button
              onClick={open}
              className="flex h-12 items-center justify-center gap-2.5 rounded-lg bg-white/20 px-6 text-base font-semibold text-white backdrop-blur-md transition-all hover:bg-white/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:h-14 lg:px-7 lg:text-lg"
            >
              <Info className="h-5 w-5" />
              More info
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** "★ 7.2 · 2022 · Show · Drama · Thriller" */
function MetaLine({
  rating,
  year,
  type,
  genres,
  className,
}: {
  rating: string | null
  year: string
  type: 'movie' | 'tv'
  genres: string[]
  className?: string
}) {
  const parts = [year, type === 'tv' ? 'Show' : 'Movie', ...genres].filter(Boolean)
  return (
    <div className={cn('relative flex flex-wrap items-center gap-x-2.5 gap-y-1 font-medium text-white/90', className)}>
      {rating && (
        <span className="flex items-center gap-1.5">
          <Star className="h-[1em] w-[1em] fill-primary text-primary" aria-hidden="true" />
          <span>{rating}</span>
        </span>
      )}
      {parts.map((part, i) => (
        <span key={part} className="flex items-center gap-2.5">
          {(i > 0 || rating) && <span className="h-1 w-1 rounded-full bg-white/45" aria-hidden="true" />}
          {part}
        </span>
      ))}
    </div>
  )
}
