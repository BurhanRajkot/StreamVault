import { useState, useEffect, useRef } from 'react'
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
  const [progress, setProgress] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const displayItems = items.slice(0, 5)
  const count = displayItems.length

  /**
   * startTimer — resets and restarts both the progress ticker and the slide advancer.
   * Called on mount, on manual slide change, and whenever count changes.
   */
  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
    setProgress(0)
    if (count === 0) return

    const tickMs = 60 // ~60fps progress update
    progressRef.current = setInterval(() => {
      setProgress((p) => Math.min(p + (tickMs / INTERVAL_MS) * 100, 100))
    }, tickMs)

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count)
      setProgress(0)
    }, INTERVAL_MS)
  }

  useEffect(() => {
    startTimer()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const goTo = (index: number) => {
    setCurrentIndex(index)
    startTimer()
  }

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

      {/* Slide indicators with live progress fill on active dot */}
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
                className="absolute inset-y-0 left-0 rounded-full bg-white"
                style={{ width: `${progress}%`, transition: 'width 60ms linear' }}
              />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
