import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Media } from '@/lib/config'
import { MediaCard } from './MediaCard'
import { cn } from '@/lib/utils'

interface HeroCarouselProps {
  items: Media[]
  onMediaClick: (media: Media) => void
}

export function HeroCarousel({ items, onMediaClick }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (items.length === 0) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5))
    }, 6000)

    return () => clearInterval(timer)
  }, [items.length])

  if (items.length === 0) return null

  const displayItems = items.slice(0, 5)

  const goToPrev = () => {
    setCurrentIndex(
      (prev) => (prev - 1 + displayItems.length) % displayItems.length
    )
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % displayItems.length)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) {
      delta > 0 ? goToNext() : goToPrev()
    }
    touchStartX.current = null
  }

  return (
    <section className="relative mb-6">
      {/* TALLER HERO ON XL / 2XL SCREENS */}
      <div
        className="relative h-[240px] sm:h-[360px] md:h-[420px] xl:h-[480px] 2xl:h-[540px] overflow-hidden rounded-xl"
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

        {/* Navigation */}
        <button
          onClick={goToPrev}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow hidden sm:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow hidden sm:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Indicators */}

    </section>
  )
}
