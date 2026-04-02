import { useEffect, useRef, useCallback, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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

/**
 * Returns the number of grid columns for the current viewport.
 * Matches the Tailwind responsive breakpoints:
 *   3 cols  < 640px  (sm)
 *   4 cols  640–768px
 *   5 cols  768–1024px (md)
 *   6 cols  1024–1280px (lg)
 *   7 cols  1280–1536px (xl)
 *   8 cols  ≥ 1536px (2xl)
 */
function getColCount(width: number): number {
  if (width >= 1536) return 8
  if (width >= 1280) return 7
  if (width >= 1024) return 6
  if (width >= 768)  return 5
  if (width >= 640)  return 4
  return 3
}

export function MediaGrid({
  media,
  isLoading,
  hasMore,
  onLoadMore,
  onMediaClick,
  title,
}: MediaGridProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const parentRef   = useRef<HTMLDivElement | null>(null)

  // Track container width so we can compute column count
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cols = getColCount(containerWidth)

  // Slot gap in px (matches Tailwind gap-2/gap-3/gap-4 at each breakpoint)
  const gap = containerWidth >= 768 ? 16 : containerWidth >= 640 ? 12 : 8

  // Aspect ratio 2:3 — compute row height from column width
  const cardWidth  = (containerWidth - gap * (cols - 1)) / cols
  const rowHeight  = Math.round((cardWidth / 2) * 3) + gap // 2:3 ratio + gap

  // Chunk media into rows of `cols`
  const rows = [] as Media[][]
  for (let i = 0; i < media.length; i += cols) {
    rows.push(media.slice(i, i + cols))
  }

  // Add a skeleton row if loading
  const skeletonRowCount = isLoading ? Math.ceil((containerWidth < 640 ? 6 : 12) / cols) : 0

  const totalRows = rows.length + skeletonRowCount

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => document.documentElement,
    estimateSize: () => rowHeight,
    overscan: 3,
    gap,
  })

  // IntersectionObserver for infinite scroll sentinel
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        onLoadMore()
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '200px',
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const virtualRows = rowVirtualizer.getVirtualItems()

  return (
    <section className="animate-fade-in">
      {title && (
        <h2 className="mb-2 text-lg font-bold text-foreground sm:mb-4 sm:text-xl">
          {title}
        </h2>
      )}

      {/* Virtual scroll container — height = total estimated scroll height */}
      <div
        ref={parentRef}
        style={{ position: 'relative', height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map(virtualRow => {
          const isSkeletonRow = virtualRow.index >= rows.length

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {isSkeletonRow
                ? Array.from({ length: cols }).map((_, i) => (
                    <MediaCardSkeleton key={`sk-${virtualRow.index}-${i}`} />
                  ))
                : rows[virtualRow.index].map((item, i) => {
                    const absoluteIndex = virtualRow.index * cols + i
                    return (
                      <MediaCard
                        key={item.id}
                        media={item}
                        onClick={onMediaClick}
                        priority={absoluteIndex < cols * 2}
                      />
                    )
                  })}
            </div>
          )
        })}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-10" />

      {!hasMore && media.length > 0 && (
        <p className="mt-8 text-center text-muted-foreground">
          You&apos;ve reached the end!
        </p>
      )}

      {!isLoading && media.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-foreground">No results found</p>
          <p className="mt-2 text-muted-foreground">Try a different search term</p>
        </div>
      )}
    </section>
  )
}
