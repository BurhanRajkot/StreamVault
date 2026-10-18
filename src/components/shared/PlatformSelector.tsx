import { cn } from '@/lib/utils'
import { OTT_PROVIDERS } from '@/lib/ottProviders'

interface PlatformSelectorProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

/** A service tile and its name; the selected one gets a ring. */
const tileButton = 'group flex w-16 shrink-0 snap-start flex-col items-center gap-2 outline-none md:w-20 tap-scale'
const tileFace =
  'flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-primary md:h-16 md:w-16'
const tileLabel = 'w-full truncate text-center text-xs font-medium transition-colors md:text-[13px]'

export function PlatformSelector({ selected, onSelect }: PlatformSelectorProps) {
  return (
    /* No horizontal padding on mobile — the page gutter already provides it */
    <div className="mb-4 mt-5 w-full md:px-10">
      <h2 className="mb-3 text-[17px] font-bold text-foreground md:mb-4 md:text-xl">Browse by service</h2>

      <div className="no-scrollbar -mx-3 flex snap-x items-start gap-3 overflow-x-auto px-3 pb-2 pt-1 sm:-mx-4 sm:px-4 md:mx-0 md:flex-wrap md:gap-4 md:px-0">
        <button onClick={() => onSelect(null)} aria-pressed={selected === null} className={tileButton}>
          <span
            className={cn(
              tileFace,
              'text-sm font-bold md:text-base',
              selected === null ? 'bg-foreground text-background ring-2 ring-foreground' : 'bg-secondary text-foreground/80'
            )}
          >
            All
          </span>
          <span className={cn(tileLabel, selected === null ? 'text-foreground' : 'text-foreground/65 group-hover:text-foreground')}>
            Everything
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
              className={tileButton}
            >
              <span className={cn(tileFace, isSelected ? 'ring-2 ring-foreground' : 'ring-1 ring-border')}>
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
              <span className={cn(tileLabel, isSelected ? 'text-foreground' : 'text-foreground/65 group-hover:text-foreground')}>
                {provider.displayName}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
