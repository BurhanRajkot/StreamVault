import { useState, useEffect } from 'react'
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

  return (
    <section className="relative mb-6">
      {/* 🔥 TALLER HERO ON XL / 2XL SCREENS */}
      <div className="relative h-[360px] md:h-[420px] xl:h-[480px] 2xl:h-[540px] overflow-hidden rounded-xl">
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
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-xl p-3 shadow-xl border border-border/50 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-glow"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Indicators */}
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 bg-background/60 backdrop-blur-xl px-4 py-2 rounded-full border border-border/50 shadow-xl">
          {displayItems.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={cn(
                'h-1.5 md:h-2.5 rounded-full transition-all duration-300',
                index === currentIndex
                  ? 'w-4 md:w-10 bg-gradient-primary shadow-lg shadow-primary/50'
                  : 'w-1.5 md:w-2.5 bg-foreground/30 hover:bg-foreground/60 hover:scale-110'
              )}
            />
          ))}
        </div>
    </section>
  )
}
