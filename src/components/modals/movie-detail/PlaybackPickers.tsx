import type { Ref } from 'react'
import { Zap } from 'lucide-react'
import { DEBRID_SERVER_ID, serverOptions, type MediaMode, type ServerOption } from '@/lib/config'
import { useDebridFreeUntil } from '@/hooks/useDebridPromo'
import type { SeasonSummary } from '@/lib/episodeNavigation'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { seasonOptions } from './types'

/**
 * The server / season / episode pickers of the title page, shared by the
 * pre-play layouts and the player. The title page is always dark, but these
 * menus portal out to <body> — hence `dark` on the content, so they don't
 * come up light in the light theme.
 */
const trigger =
  'h-11 rounded-lg border-white/10 bg-white/[0.07] px-3.5 text-sm font-medium text-white ring-offset-black transition-colors hover:bg-white/[0.12] focus:ring-white/40'
const content =
  'dark z-[200] max-h-[min(60vh,22rem)] rounded-xl border-white/10 bg-neutral-900 text-white shadow-2xl custom-scrollbar'
const item = 'cursor-pointer py-2.5 text-sm focus:bg-white/10 focus:text-white'

/** "Premium 4K/1080p Free" — the zap and the free tag are drawn, the rest is plain text. */
function ServerLabel({ option }: { option: ServerOption }) {
  if (option.id !== DEBRID_SERVER_ID) return <>{option.name}</>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Zap className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
      <span className="font-semibold">{option.name}</span>{' '}
      <span className="text-white/55">{option.detail}</span>
      {option.free && (
        <>
          {' '}
          <span className="rounded bg-emerald-400/15 px-1.5 text-xs font-semibold text-emerald-300">Free</span>
        </>
      )}
    </span>
  )
}

interface ServerSelectProps {
  mode: MediaMode
  value: string
  onChange: (server: string) => void
  /** For opening the picker from elsewhere ("Switch server"). */
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}

export function ServerSelect({ mode, value, onChange, triggerRef, className }: ServerSelectProps) {
  const debridFree = useDebridFreeUntil() !== null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger ref={triggerRef} aria-label="Server" className={cn(trigger, className)}>
        <SelectValue placeholder="Server" />
      </SelectTrigger>
      <SelectContent className={content}>
        {serverOptions(mode, { debridFree }).map((option) => (
          <SelectItem key={option.id} value={option.id} className={item}>
            <ServerLabel option={option} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface SeasonEpisodeSelectsProps {
  seasons: SeasonSummary[]
  season: number
  episode: number
  /** Episodes in the selected season. */
  episodeCount: number
  onSeasonChange: (season: number) => void
  onEpisodeChange: (episode: number) => void
  className?: string
  triggerClassName?: string
}

/** Season and episode, side by side. Picking a season starts it from episode 1. */
export function SeasonEpisodeSelects({
  seasons,
  season,
  episode,
  episodeCount,
  onSeasonChange,
  onEpisodeChange,
  className,
  triggerClassName,
}: SeasonEpisodeSelectsProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2.5', className)}>
      <Select
        value={season.toString()}
        onValueChange={(val) => {
          onSeasonChange(Number(val))
          onEpisodeChange(1)
        }}
      >
        <SelectTrigger aria-label="Season" className={cn(trigger, triggerClassName)}>
          <SelectValue placeholder="Season" />
        </SelectTrigger>
        <SelectContent className={content}>
          {seasonOptions(seasons).map((n) => (
            <SelectItem key={n} value={n.toString()} className={item}>
              Season {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={episode.toString()} onValueChange={(val) => onEpisodeChange(Number(val))}>
        <SelectTrigger aria-label="Episode" className={cn(trigger, triggerClassName)}>
          <SelectValue placeholder="Episode" />
        </SelectTrigger>
        <SelectContent className={content}>
          {Array.from({ length: episodeCount }, (_, i) => i + 1).map((n) => (
            <SelectItem key={n} value={n.toString()} className={item}>
              Episode {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
