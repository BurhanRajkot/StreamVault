import type { Ref } from 'react'
import { Download, Zap } from 'lucide-react'
import { DEBRID_SERVER_ID, serverOptions, type MediaMode, type ServerOption } from '@/lib/config'
import type { ReleaseControls } from '@/components/media/DebridPlayerPane'
import type { PlayerSource } from '@/components/media/PlayerControls'
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

interface SeasonSelectProps {
  seasons: SeasonSummary[]
  value: number
  onChange: (season: number) => void
  className?: string
}

/** Just the season — on its own where picking one browses rather than plays (the episode list). */
export function SeasonSelect({ seasons, value, onChange, className }: SeasonSelectProps) {
  return (
    <Select value={value.toString()} onValueChange={(val) => onChange(Number(val))}>
      <SelectTrigger aria-label="Season" className={cn(trigger, className)}>
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
  )
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
      <SeasonSelect
        seasons={seasons}
        value={season}
        onChange={(n) => {
          onSeasonChange(n)
          onEpisodeChange(1)
        }}
        className={triggerClassName}
      />

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

/** "1080p HDR · 2.4 GB" */
function releaseSummary(source: PlayerSource): string {
  return [[source.label, ...(source.tags ?? [])].join(' '), source.size].filter(Boolean).join(' · ')
}

interface ReleaseSelectProps {
  controls: ReleaseControls
  className?: string
}

/** The Premium release playing, and the others that start instantly. Switching keeps the viewer's place. */
export function ReleaseSelect({ controls, className }: ReleaseSelectProps) {
  const { releases, activeId, onSelect, busy } = controls
  const active = releases.find((r) => r.id === activeId)
  return (
    <Select value={activeId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger aria-label="Release" className={cn(trigger, className)}>
        <SelectValue placeholder="Release">
          <span className="text-white/50">Release</span>{' '}
          <span className="font-semibold">{active ? releaseSummary(active) : busy ? 'Finding…' : 'Choose'}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn(content, 'max-h-[min(60vh,26rem)] w-[min(26rem,calc(100vw-2rem))]')}>
        {releases.map((source) => (
          <SelectItem key={source.id} value={source.id} className={cn(item, 'py-2')}>
            <span className="block">
              <span className="font-semibold">{source.label}</span>
              {source.tags && source.tags.length > 0 && <span className="text-white/60"> {source.tags.join(' · ')}</span>}
              {source.size && <span className="text-white/50"> · {source.size}</span>}
            </span>
            {source.name && (
              <span className="block max-w-[min(21rem,calc(100vw-6rem))] truncate text-[11px] text-white/45">{source.name}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface DownloadButtonProps {
  download: ReleaseControls['download']
  /** The file size after the label — off where the release picker beside it already says it. */
  showSize?: boolean
  className?: string
}

/**
 * Saves the playing file. Real-Debrid serves its direct link as a download,
 * not a page — a new tab just in case a browser would rather open it.
 */
export function DownloadButton({ download, showSize = true, className }: DownloadButtonProps) {
  const classes = cn(trigger, 'inline-flex items-center justify-center gap-2 border', className)
  if (!download) {
    return (
      <button type="button" disabled className={cn(classes, 'cursor-not-allowed opacity-50')}>
        <Download className="h-4 w-4" aria-hidden="true" />
        Download
      </button>
    )
  }
  return (
    <a href={download.url} download={download.fileName} target="_blank" rel="noopener noreferrer" title={download.fileName} className={classes}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Download
      {showSize && download.size && <span className="font-normal text-white/55">{download.size}</span>}
    </a>
  )
}
