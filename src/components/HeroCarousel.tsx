import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Media } from '@/lib/config';
import { MediaCard } from './MediaCard';
import { cn } from '@/lib/utils';

interface HeroCarouselProps {
  items: Media[];
  onMediaClick: (media: Media) => void;
}

export function HeroCarousel({ items, onMediaClick }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (items.length === 0) return;
    
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
    }, 6000);

    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const displayItems = items.slice(0, 5);

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + displayItems.length) % displayItems.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % displayItems.length);
  };

  return (
    <section className="relative mb-10">
      <div className="relative overflow-hidden rounded-xl">
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'transition-all duration-700 ease-out',
              index === currentIndex
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 absolute inset-0 translate-x-full'
            )}
          >
            {index === currentIndex && (
              <MediaCard media={item} onClick={onMediaClick} variant="hero" />
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <button
        onClick={goToPrev}
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-all hover:bg-primary hover:text-primary-foreground"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={goToNext}
        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-all hover:bg-primary hover:text-primary-foreground"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {displayItems.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              index === currentIndex
                ? 'w-8 bg-primary'
                : 'w-2 bg-foreground/30 hover:bg-foreground/50'
            )}
          />
        ))}
      </div>
    </section>
  );
}
