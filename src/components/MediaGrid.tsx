import { useEffect, useRef, useCallback } from 'react'
import { Media } from '@/lib/config'
import { MediaCard, MediaCardSkeleton } from './MediaCard'

interface MediaGridProps {
  media: Media[]
  isLoading: boolean
  hasMore: boolean
  onLoadMore: () => void
  onMediaClick: (media: Media) => void
  title?: string
}

export function MediaGrid({
  media,
  isLoading,
  hasMore,
  onLoadMore,
  onMediaClick,
  title,
}: MediaGridProps) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0]
      if (target.isIntersecting && hasMore && !isLoading) {
        onLoadMore()
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const element = loadMoreRef.current
    if (!element) return

    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    })

    observerRef.current.observe(element)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [handleObserver])

  return (
    <section className="animate-fade-in">
      {title && (
        <h2 className="mb-4 text-lg font-bold text-foreground sm:mb-6 sm:text-2xl">
          {title}
        </h2>
      )}

      <div
        className="
          grid
          grid-cols-2
          gap-3
          sm:grid-cols-3
          sm:gap-4
          md:grid-cols-4
          lg:grid-cols-5
          xl:grid-cols-6
        "
      >
        {media.map((item) => (
          <MediaCard key={item.id} media={item} onClick={onMediaClick} />
        ))}

        {isLoading &&
          Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={`skeleton-${i}`} />
          ))}
      </div>

      {/* Load More Trigger */}
      <div ref={loadMoreRef} className="h-10" />

      {!hasMore && media.length > 0 && (
        <p className="mt-8 text-center text-muted-foreground">
          You&apos;ve reached the end!
        </p>
      )}

      {!isLoading && media.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-foreground">
            No results found
          </p>
          <p className="mt-2 text-muted-foreground">
            Try a different search term
          </p>
        </div>
      )}
    </section>
  )
}
