import { useId } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { MediaCard, MediaCardSkeleton } from '@/components/media/MediaCard'
import { useScrollArrows } from '@/hooks/useScrollArrows'

interface MediaRowProps {
  title: string
  /** Beside the title, on desktop only. */
  strapline?: string
  media: Media[]
  isPending: boolean
  onMediaClick: (media: Media) => void
}

/** A titled, horizontally scrolling row of posters. Renders nothing once loaded empty. */
export function MediaRow({ title, strapline, media, isPending, onMediaClick }: MediaRowProps) {
  const headingId = useId()
  const { ref: rowRef, showLeftButton, showRightButton, scrollBy } = useScrollArrows([media])

  if (!isPending && media.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="group/row relative mb-6">
      {/* Header */}
      <div className="mb-2.5 flex flex-row items-end justify-between gap-4 sm:mb-4">
        <h2 id={headingId} className="text-[17px] font-bold leading-tight text-foreground sm:text-2xl">{title}</h2>
        {/* The strapline costs a phone half its header width for no navigation value */}
        {strapline && (
          <p className="hidden shrink-0 text-right text-sm text-foreground/80 md:block">{strapline}</p>
        )}
      </div>

      {/* Row arrows — revealed by CSS group-hover, never by state */}
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={cn(
            'pointer-events-none absolute bottom-4 top-10 z-30 hidden items-center justify-center opacity-0 transition-opacity duration-300 md:flex',
            side === 'left' ? 'left-0 md:-left-4' : 'right-0 md:-right-4',
            (side === 'left' ? showLeftButton : showRightButton) && 'group-hover/row:opacity-100'
          )}
        >
          <button
            onClick={() => scrollBy(side)}
            className="pointer-events-auto text-white/70 drop-shadow-[0_0_6px_rgba(0,0,0,0.8)] transition-all duration-200 hover:scale-125 hover:text-white"
            aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
          >
            {side === 'left' ? (
              <ChevronLeft className="h-10 w-10 md:h-12 md:w-12" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-10 w-10 md:h-12 md:w-12" strokeWidth={2} />
            )}
          </button>
        </div>
      ))}

      {/* Horizontal scroll row */}
      <div
        ref={rowRef}
        className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto scroll-smooth px-3 pb-3 sm:-mx-4 sm:gap-4 sm:px-4 md:mx-0 md:px-8 md:pb-4"
        style={{ contain: 'layout' }}
      >
        {isPending
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[30vw] min-w-[104px] max-w-[150px] flex-shrink-0 md:w-[clamp(160px,9vw,300px)] md:max-w-none">
                <MediaCardSkeleton />
              </div>
            ))
          : media.map((item) => (
              <div
                key={`${item.media_type}-${item.id}`}
                className="w-[30vw] min-w-[104px] max-w-[150px] flex-shrink-0 md:w-[clamp(160px,9vw,300px)] md:max-w-none"
              >
                <MediaCard media={item} onClick={onMediaClick} />
              </div>
            ))}
      </div>
    </section>
  )
}
