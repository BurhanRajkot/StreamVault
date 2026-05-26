import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Media } from '@/lib/config'
import { MediaCard } from './MediaCard'
import { cn } from '@/lib/utils'

interface HeroCarouselProps {
  items: Media[]
  onMediaClick: (media: Media, season?: number, episode?: number, server?: string, autoPlay?: boolean) => void
}

const INTERVAL_MS = 6000

export function HeroCarousel({ items, onMediaClick }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // progressKey is bumped each time we reset the CSS animation — zero JS ticking
  const [progressKey, setProgressKey] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPausedRef = useRef(false)

  const displayItems = items.slice(0, 5)
  const count = displayItems.length

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setProgressKey((k) => k + 1) // restart CSS progress animation
    if (count === 0) return

    intervalRef.current = setInterval(() => {
      if (isPausedRef.current) return
      setCurrentIndex((prev) => (prev + 1) % count)
      setProgressKey((k) => k + 1)
    }, INTERVAL_MS)
  }, [count])

  useEffect(() => {
    startTimer()
    // Pause when tab is hidden to save resources
    const onVisibility = () => { isPausedRef.current = document.hidden }
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

  const goToPrev = () => goTo((currentIndex - 1 + count) % count)
  const goToNext = () => goTo((currentIndex + 1) % count)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) {
      if (delta > 0) goToNext()
      else goToPrev()
    }
    touchStartX.current = null
  }

  if (items.length === 0) {
    return (
      <section className="relative mb-6" aria-label="Featured content loading">
        <div className="relative h-[clamp(240px,25vw,750px)] overflow-hidden rounded-b-xl bg-secondary/40 animate-pulse" />
      </section>
    )
  }

  return (
    <section className="relative mb-6" aria-label="Featured content carousel">
      {/* Screen reader live region — announces slide changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Slide ${currentIndex + 1} of ${count}: ${displayItems[currentIndex]?.title || displayItems[currentIndex]?.name || ''}`}
      </div>

      {/* TALLER HERO ON XL / 2XL SCREENS */}
      <div
        className="relative h-[clamp(240px,25vw,750px)] overflow-hidden rounded-b-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 ease-out',
              index === currentIndex
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'
            )}
          >
            {index === currentIndex && (
              <MediaCard
                media={item}
                onClick={onMediaClick}
                variant="hero"
              />
            )}
          </div>
        ))}
      </div>

      {/* Previous / next buttons */}
      <button
        onClick={goToPrev}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow hidden sm:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        onClick={goToNext}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow hidden sm:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Slide indicators with CSS-animated progress (zero JS per-tick) */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2">
        {displayItems.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            aria-label={`Go to slide ${index + 1}`}
            className={cn(
              'relative overflow-hidden rounded-full transition-all duration-500',
              index === currentIndex
                ? 'w-8 h-2 bg-white/30'
                : 'w-2 h-2 bg-white/25 hover:bg-white/55'
            )}
          >
            {index === currentIndex && (
              <span
                key={progressKey}
                className="absolute inset-y-0 left-0 rounded-full bg-white hero-progress-bar"
              />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
