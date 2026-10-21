import { useEffect, useRef, useState, type Ref } from 'react'
import { Check, Download, Heart, Play, Share2 } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, type MediaMode } from '@/lib/config'
import type { EpisodeSummary } from '@/lib/api'
import { useSeasonEpisodes } from '@/hooks/useSeasonEpisodes'
import type { SeasonSummary } from '@/lib/episodeNavigation'
import type { ReleaseControls } from '@/components/media/DebridPlayerPane'
import { cn } from '@/lib/utils'
import { DownloadButton, ReleaseSelect, SeasonSelect, ServerSelect } from './PlaybackPickers'

/**
 * The pieces under (or beside) the player while something plays — what's on,
 * where it's playing from, and the season's episodes. Shared by the phone
 * panel and the desktop theater so the two can't drift apart.
 */

const roundButton =
  'flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/90 transition-colors hover:bg-white/[0.14] hover:text-white active:bg-white/[0.18] tap-scale'

interface NowPlayingHeadingProps {
  title: string
  /** "S1 · E3 · The Pointy End", or the film's year · runtime · rating. */
  metaLine: string
  favorited: boolean
  onToggleFavorite: () => void
  isCopied: boolean
  onShare: () => void
  size?: 'phone' | 'desktop'
}

/** Title and what's on, with My List / Share beside them. */
export function NowPlayingHeading({
  title,
  metaLine,
  favorited,
  onToggleFavorite,
  isCopied,
  onShare,
  size = 'phone',
}: NowPlayingHeadingProps) {
  const desktop = size === 'desktop'
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1
          className={cn(
            'font-display font-bold tracking-tight text-white',
            desktop ? 'text-2xl leading-tight lg:text-3xl' : 'line-clamp-2 text-[19px] leading-snug'
          )}
        >
          {title}
        </h1>
        {metaLine && (
          <p className={cn('mt-1 line-clamp-1 font-medium text-white/55', desktop ? 'text-[15px]' : 'text-[13px]')}>
            {metaLine}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onToggleFavorite}
          aria-pressed={favorited}
          aria-label={favorited ? 'Remove from My List' : 'Add to My List'}
          title={favorited ? 'In My List' : 'Add to My List'}
          className={cn(roundButton, desktop ? 'h-11 gap-2 px-4 text-sm font-semibold' : 'h-10 w-10')}
        >
          <Heart className={cn('h-[18px] w-[18px]', favorited && 'fill-red-500 text-red-500')} />
          {desktop && (favorited ? 'In My List' : 'My List')}
        </button>
        <button
          onClick={onShare}
          aria-label={isCopied ? 'Link copied' : 'Share'}
          title="Share"
          className={cn(roundButton, desktop ? 'h-11 gap-2 px-4 text-sm font-semibold' : 'h-10 w-10')}
        >
          {isCopied ? <Check className="h-[18px] w-[18px] text-emerald-400" /> : <Share2 className="h-[18px] w-[18px]" />}
          {desktop && (isCopied ? 'Copied' : 'Share')}
        </button>
      </div>
    </div>
  )
}

interface SourcePickersProps {
  mode: MediaMode
  server: string
  onServerChange: (server: string) => void
  serverTriggerRef?: Ref<HTMLButtonElement>
  releaseControls: ReleaseControls | null
  size?: 'phone' | 'desktop'
  className?: string
}

/**
 * Server, release and download in one row. On a phone the triggers say only
 * "⚡ Premium" and "1080p · 2.4 GB" so the three fit across the screen.
 */
export function SourcePickers({
  mode,
  server,
  onServerChange,
  serverTriggerRef,
  releaseControls,
  size = 'phone',
  className,
}: SourcePickersProps) {
  const phone = size === 'phone'
  const premium = server === DEBRID_SERVER_ID && releaseControls
  return (
    <div className={cn('flex items-center gap-2', !phone && 'flex-wrap gap-2.5', className)}>
      <ServerSelect
        mode={mode}
        value={server}
        onChange={onServerChange}
        triggerRef={serverTriggerRef}
        compact={phone}
        className={phone ? 'h-10 w-auto shrink-0 gap-2 rounded-full px-4 text-[13px]' : 'h-11 w-64'}
      />
      {premium && (
        <>
          <ReleaseSelect
            controls={releaseControls}
            compact={phone}
            className={phone ? 'h-10 min-w-0 flex-1 rounded-full px-4 text-[13px]' : 'h-11 w-72'}
          />
          <DownloadButton
            download={releaseControls.download}
            iconOnly={phone}
            className={phone ? 'h-10 w-10 shrink-0 rounded-full' : 'h-11 px-4'}
          />
        </>
      )}
    </div>
  )
}

/** Synopsis length past which it starts clamped behind a "More" toggle. */
const OVERVIEW_CLAMP_THRESHOLD = 160

export function Synopsis({ text, heading, className }: { text: string; heading?: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  return (
    <div className={className}>
      {heading && <h2 className="mb-1.5 text-[13px] font-semibold text-white/50">{heading}</h2>}
      <p className={cn('text-[14px] leading-relaxed text-white/70', !expanded && 'line-clamp-3')}>{text}</p>
      {text.length > OVERVIEW_CLAMP_THRESHOLD && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-[13px] font-semibold text-white/50">
          {expanded ? 'Show less' : 'More'}
        </button>
      )}
    </div>
  )
}

interface EpisodeListProps {
  tvId: number
  seasons: SeasonSummary[]
  season: number
  episode: number
  /** Episodes in the playing season. */
  episodeCount: number
  onPick: (season: number, episode: number) => void
  /** Phone: small stills, one line each. Desktop: bigger stills with the episode's synopsis. */
  density?: 'compact' | 'comfortable'
  className?: string
  /** The list itself — give it a height and overflow to make it scroll on its own. */
  listClassName?: string
  /** Mark the current episode as playing — off on the title page, where nothing plays yet. */
  markCurrent?: boolean
  /** A download button on every row. */
  onDownload?: (season: number, episode: number, name: string) => void
}

/** Today, as TMDB writes air dates — for telling which episodes are out yet. */
const today = () => new Date().toISOString().slice(0, 10)

function formatAirDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Every episode of a season, the playing one marked; a tap plays one. */
export function EpisodeList({
  tvId,
  seasons,
  season,
  episode,
  episodeCount,
  onPick,
  density = 'compact',
  className,
  listClassName,
  markCurrent = true,
  onDownload,
}: EpisodeListProps) {
  // Picking a season here only browses it; the playing episode changes on a
  // tap. The choice is remembered against the season that was playing when it
  // was made, so once the player moves on by itself (next episode, into the
  // next season) the list follows it instead.
  const [browse, setBrowse] = useState({ from: season, to: season })
  const browseSeason = browse.from === season ? browse.to : season
  const setBrowseSeason = (to: number) => setBrowse({ from: season, to })
  const comfortable = density === 'comfortable'

  const { data: episodes, isPending } = useSeasonEpisodes(tvId, browseSeason, true)
  const knownCount =
    browseSeason === season ? episodeCount : (seasons.find((s) => s.season_number === browseSeason)?.episode_count ?? 0)
  // No metadata (a failed fetch, or one still on its way): numbered rows still play
  const rows: EpisodeSummary[] =
    episodes && episodes.length > 0
      ? episodes
      : Array.from({ length: knownCount }, (_, i) => ({
          episode_number: i + 1,
          name: '',
          overview: '',
          still_path: null,
          runtime: null,
          air_date: null,
        }))
  const now = today()

  // A list that scrolls on its own starts at the playing episode. Scrolled by
  // hand rather than scrollIntoView, which would scroll the page as well.
  const listRef = useRef<HTMLOListElement>(null)
  const playingInView = browseSeason === season
  useEffect(() => {
    const list = listRef.current
    if (!list || !playingInView || list.scrollHeight <= list.clientHeight) return
    const current = list.querySelector<HTMLElement>('[aria-current="true"]')
    if (current) list.scrollTop = current.offsetTop - list.offsetTop - 8
  }, [playingInView, episode, rows.length])

  return (
    <section aria-label="Episodes" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 className={cn('font-bold text-white', comfortable ? 'text-lg' : 'text-[17px]')}>
          Episodes
          {rows.length > 0 && <span className="ml-2 text-sm font-medium text-white/40">{rows.length}</span>}
        </h2>
        <SeasonSelect
          seasons={seasons}
          value={browseSeason}
          onChange={setBrowseSeason}
          className="h-9 w-auto gap-2 rounded-full px-4 text-[13px] font-semibold"
        />
      </div>

      <ol ref={listRef} className={cn('mt-2.5', listClassName)} aria-busy={isPending || undefined}>
        {rows.map((ep) => {
          const playing = markCurrent && browseSeason === season && ep.episode_number === episode
          const unaired = !!ep.air_date && ep.air_date > now
          const name = ep.name || `Episode ${ep.episode_number}`
          const note = playing
            ? 'Now playing'
            : unaired
              ? `Airs ${formatAirDate(ep.air_date as string)}`
              : ep.runtime
                ? `${ep.runtime}m`
                : ''
          return (
            <li key={ep.episode_number} className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (!playing) onPick(browseSeason, ep.episode_number)
                }}
                aria-current={playing || undefined}
                aria-label={`Episode ${ep.episode_number}: ${name}${playing ? ', now playing' : ''}`}
                className={cn(
                  'group flex min-w-0 flex-1 items-center text-left transition-colors',
                  comfortable
                    ? 'gap-4 rounded-xl p-2.5 hover:bg-white/[0.05]'
                    : 'gap-3 rounded-lg px-2 py-1 active:bg-white/[0.08]',
                  playing && 'bg-white/[0.07] hover:bg-white/[0.07]'
                )}
              >
                <div
                  className={cn(
                    'relative aspect-video shrink-0 overflow-hidden rounded-md bg-white/[0.06]',
                    comfortable ? 'w-40' : 'w-[5.5rem]'
                  )}
                >
                  {ep.still_path ? (
                    <img
                      src={`${CONFIG.IMG_BASE_URL}/w300${ep.still_path}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn('h-full w-full object-cover', unaired && 'opacity-40')}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white/25">
                      {ep.episode_number}
                    </span>
                  )}
                  {playing ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <NowPlayingBars />
                    </span>
                  ) : (
                    comfortable && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-6 w-6 fill-white text-white" />
                      </span>
                    )
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'font-semibold leading-snug',
                      comfortable ? 'line-clamp-1 text-[15px]' : 'line-clamp-1 text-[13.5px]',
                      playing ? 'text-white' : 'text-white/90'
                    )}
                  >
                    <span className="tabular-nums text-white/45">{ep.episode_number}.</span> {name}
                  </p>
                  {note && (
                    <p
                      className={cn(
                        'mt-0.5 text-xs',
                        playing ? 'font-semibold text-[hsl(221_90%_70%)]' : 'text-white/45'
                      )}
                    >
                      {note}
                    </p>
                  )}
                  {comfortable && ep.overview && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-white/50">{ep.overview}</p>
                  )}
                </div>
              </button>
              {onDownload && (
                <button
                  onClick={() => onDownload(browseSeason, ep.episode_number, name)}
                  aria-label={`Download episode ${ep.episode_number}`}
                  title="Download"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
                >
                  <Download className="h-[18px] w-[18px]" />
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Three bars — the "this one's on" marker over the playing episode's still. */
function NowPlayingBars() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white" />
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white [animation-delay:-0.4s]" />
      <span className="now-playing-bar h-full w-[3px] rounded-full bg-white [animation-delay:-0.8s]" />
    </span>
  )
}
