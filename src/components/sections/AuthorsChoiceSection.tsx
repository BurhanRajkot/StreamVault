import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  AUTHORS_CHOICE_MOVIES,
  AUTHORS_CHOICE_TV,
  AUTHORS_CHOICE_DOCUMENTARIES,
  type AuthorsChoiceItem,
} from '@/Data/authorsChoice'
import { fetchMediaSummaries } from '@/lib/api'
import { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { MediaCard, MediaCardSkeleton } from '@/components/media/MediaCard'
import { useScrollArrows } from '@/hooks/useScrollArrows'

interface Props {
  onMediaClick: (media: Media) => void
  mode?: 'movie' | 'tv' | 'documentary' | 'all'
}

/** Posters in the row. */
const ROW_SIZE = 12
/** Asked for beyond the row, so a title TMDB no longer has doesn't leave a gap. */
const SPARE = 2

const TITLES: Record<NonNullable<Props['mode']>, string> = {
  movie: "Author's Choice: Movies",
  tv: "Author's Choice: TV Shows",
  documentary: "Author's Choice: Documentaries",
  all: "Author's Choice",
}

/** Fisher–Yates — `sort(() => Math.random() - 0.5)` is biased toward the original order. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The hand-picked titles this row shows, best first — only what fits in the row is fetched. */
function picksFor(mode: NonNullable<Props['mode']>): AuthorsChoiceItem[] {
  switch (mode) {
    case 'movie':
      return AUTHORS_CHOICE_MOVIES
    case 'tv':
      return AUTHORS_CHOICE_TV
    case 'documentary':
      return AUTHORS_CHOICE_DOCUMENTARIES
    default:
      // A taste of each list
      return shuffled([
        ...AUTHORS_CHOICE_MOVIES.slice(0, 5),
        ...AUTHORS_CHOICE_TV.slice(0, 5),
        ...AUTHORS_CHOICE_DOCUMENTARIES.slice(0, 5),
      ])
  }
}

export function AuthorsChoiceSection({ onMediaClick, mode = 'movie' }: Props) {
  // One batched request for the row's posters, cached for the session: the
  // list only changes with a deploy. (It used to fetch full details —
  // credits, similar titles, images — for every title in the list, all 60
  // movies of it, to show 12.)
  const { data: media = [], isPending } = useQuery({
    queryKey: ['authorsChoice', mode],
    queryFn: async () => (await fetchMediaSummaries(picksFor(mode).slice(0, ROW_SIZE + SPARE))).slice(0, ROW_SIZE),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })

  const { ref: rowRef, showLeftButton, showRightButton, scrollBy } = useScrollArrows([mode, media])

  return (
    <section className="group/row relative mb-6">
      {/* Header */}
      <div className="mb-2.5 flex flex-row items-end justify-between gap-4 sm:mb-4">
        <h2 className="text-[17px] font-bold leading-tight text-foreground sm:text-2xl">{TITLES[mode]}</h2>
        {/* The strapline costs a phone half its header width for no navigation value */}
        <p className="hidden shrink-0 text-right text-sm text-foreground/80 md:block">
          Hand-picked recommendations by the creator of StreamVault
        </p>
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
