import { cn } from '@/lib/utils'
import { OTT_PROVIDERS } from '@/lib/ottProviders'

interface PlatformSelectorProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

/** A logo tile — the logo says which service; the selected one gets a ring. */
const tileButton = 'group shrink-0 snap-start outline-none tap-scale'
const tileFace =
  'flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl ring-offset-2 ring-offset-background transition-[box-shadow,transform,opacity] duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-primary md:h-12 md:w-12'

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  return (
    /* No horizontal padding on mobile — the page gutter already provides it */
    <div className="mb-6 mt-2 w-full">
      {/* One slim row of logos — the heading is for screen readers */}
      <h2 className="sr-only">Browse by service</h2>

      <div className="no-scrollbar -mx-[var(--sv-gutter)] px-[var(--sv-gutter)] scroll-pl-[var(--sv-gutter)] flex snap-x items-center gap-2.5 overflow-x-auto py-1.5 md:gap-3">
        <button onClick={() => onSelect(null)} aria-pressed={selected === null} aria-label="All services" title="All services" className={tileButton}>
          <span
            className={cn(
              tileFace,
              'text-[13px] font-bold',
              selected === null ? 'bg-foreground text-background ring-2 ring-foreground' : 'bg-secondary text-foreground/80'
            )}
          >
            All
          </span>
        </button>

        {OTT_PROVIDERS.map((provider) => {
          const isSelected = selected === provider.id
          return (
            <button
              key={provider.id}
              onClick={() => onSelect(isSelected ? null : provider.id)}
              aria-pressed={isSelected}
              aria-label={`Filter by ${provider.displayName}`}
              title={provider.displayName}
              className={tileButton}
            >
              <span className={cn(tileFace, isSelected ? 'ring-2 ring-foreground' : 'opacity-80 ring-1 ring-border group-hover:opacity-100')}>
                <img
                  src={provider.logo}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
