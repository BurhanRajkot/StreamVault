import { useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
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

  // Distance from the top of the document to the top of the grid. The window
  // virtualizer measures scroll against the page, but the grid starts well down
  // it (hero + carousel sections), so without this offset every row is
  // positioned against the wrong origin. It has to be re-measured whenever the
  // page height changes, because the sections above the grid mount lazily as
  // they scroll into view — a one-shot read on mount goes stale immediately.
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = parentRef.current
    if (!el) return
    const measure = () => {
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
      setScrollMargin(prev => (prev === top ? prev : top))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [])

  const cols = getColCount(containerWidth)

  // Slot gap in px (matches Tailwind gap-2/gap-3/gap-4 at each breakpoint)
  const gap = containerWidth >= 768 ? 16 : containerWidth >= 640 ? 12 : 8

  // Aspect ratio 2:3 — compute row height from column width
  const cardWidth  = (containerWidth - gap * (cols - 1)) / cols
  const rowHeight  = Math.round((cardWidth / 2) * 3) // 2:3 ratio

  // Chunk media into rows of `cols`
  const rows = useMemo(() => {
    const out: Media[][] = []
    for (let i = 0; i < media.length; i += cols) {
      out.push(media.slice(i, i + cols))
    }
    return out
  }, [media, cols])

  // Add a skeleton row if loading
  const skeletonRowCount = isLoading ? Math.ceil((containerWidth < 640 ? 6 : 12) / cols) : 0

  const totalRows = rows.length + skeletonRowCount

  // Window virtualizer, NOT useVirtualizer({ getScrollElement: documentElement }):
  // the latter sizes its viewport from the scroll element's bounding rect, and
  // documentElement's rect is the height of the entire document. It therefore
  // believed the viewport was as tall as the page and rendered every single row
  // — which then made the page taller, which widened the "viewport" again.
  const rowVirtualizer = useWindowVirtualizer({
    count: totalRows,
    estimateSize: () => rowHeight,
    overscan: 2,           // pre-render 2 rows above/below; 5 was too many compositor layers
    gap,
    scrollMargin,
  })

  // estimateSize is captured per virtualizer instance, so a breakpoint change
  // (new column count -> new row height) needs the measurement cache dropped.
  useEffect(() => {
    rowVirtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, cols])

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
      rootMargin: '600px',  // trigger next-page fetch 600px before sentinel enters view
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
                transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
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
                      // TMDB's movie and tv id spaces are independent and
                      // overlap, and home/documentary feeds interleave both —
                      // a bare `item.id` collides and bleeds card state.
                      <MediaCard
                        key={`${item.media_type ?? 'unknown'}-${item.id}`}
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
