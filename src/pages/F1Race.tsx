import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, ChevronRight, Download, Lock, Play } from 'lucide-react'
import { PageMeta } from '@/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { DownloadSheet, type DownloadTarget } from '@/components/downloads/DownloadSheet'
import { F1Chrome, ResultsToggle, WinnerLine, f1Gutter } from '@/components/f1/F1Parts'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { parseTorrentQuality } from '@/lib/debridApi'
import { cn } from '@/lib/utils'
import {
  defaultSeasonYear,
  f1PremiumNote,
  f1RacePath,
  f1ReleasesQuery,
  f1SeasonQuery,
  formatF1Date,
  isUpcoming,
  releasesFor,
  sessionLabel,
  sessionsToList,
  startsAt,
  type F1Release,
  type F1Session,
  type F1SessionSlot,
} from '@/lib/f1'

const APP_DOWNLOAD_URL = 'https://github.com/BurhanRajkot/StreamVault/releases/latest'

/** One race weekend: its sessions, each to watch (Premium) or download (magnet links). */
const F1Race = () => {
  const params = useParams()
  const year = Number(params.year)
  const round = Number(params.round)
  const queryClient = useQueryClient()
  const access = usePremiumAccess()
  const [showResults, setShowResults] = useF1ShowResults()
  const [download, setDownload] = useState<DownloadTarget | null>(null)

  const { data: season, isLoading, isError, refetch } = useQuery(f1SeasonQuery(year))
  const releasesQuery = useQuery({ ...f1ReleasesQuery(year, round), enabled: !!season?.races.some((r) => r.round === round) })
  const race = season?.races.find((r) => r.round === round)
  const index = season && race ? season.races.indexOf(race) : -1
  const prev = index > 0 ? season?.races[index - 1] : undefined
  const next = season && index >= 0 ? season.races[index + 1] : undefined
  const sessions = useMemo(() => (race ? sessionsToList(race, releasesQuery.data) : []), [race, releasesQuery.data])
  const seasonLink = year === defaultSeasonYear() ? '/f1' : `/f1?season=${year}`

  const openDownload = (session: F1Session) => {
    if (!race) return
    setDownload({
      id: `f1:${year}:${round}:${session}`,
      title: `${race.name} ${year}`,
      mediaType: 'movie',
      label: sessionLabel(session, year),
      releases: async () => releasesFor(await queryClient.fetchQuery(f1ReleasesQuery(year, round)), session),
    })
  }

  const note = access.loading ? '' : f1PremiumNote(access.reason)
  const raceRun = race ? !isUpcoming({ date: race.date, time: race.time }) : false
  const firstDay = sessions.find((s) => s.date)?.date ?? null

  return (
    <>
      <PageMeta
        title={race ? `${race.name} ${year}` : `Formula 1 ${year}`}
        description={race ? `Watch or download every session of the ${year} ${race.name} — practice, qualifying and the race.` : undefined}
      />
      <F1Chrome>
        <div className="border-b border-border/50 pt-[var(--sv-header-h)]">
          <div className={`${f1Gutter} py-5 sm:py-8`}>
            <Link to={seasonLink} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {year} season
            </Link>
            {race ? (
              <>
                <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{race.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Round {race.round} · {[race.circuit, race.locality, race.country].filter(Boolean).join(', ')}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {firstDay && firstDay !== race.date ? `${formatF1Date(firstDay, { year: false })} – ` : ''}
                  {formatF1Date(race.date)}
                </p>
              </>
            ) : isLoading ? (
              <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded-lg bg-muted" />
            ) : null}
          </div>
        </div>

        <main className={`${f1Gutter} flex-1 py-5 pb-tabbar sm:py-8`}>
          {isError ? (
            <div className="flex flex-col items-center py-20 text-center">
              <AlertCircle className="h-6 w-6 text-destructive/70" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">The calendar didn't load</h2>
              <Button onClick={() => void refetch()} variant="outline" size="sm" className="mt-5">
                Try again
              </Button>
            </div>
          ) : season && !race ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              There's no round {round} in {year}. <Link to={seasonLink} className="font-medium text-primary hover:underline">See the season</Link>
            </p>
          ) : race ? (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section aria-labelledby="f1-sessions">
                <h2 id="f1-sessions" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Sessions
                </h2>
                {note && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {note}
                      {access.reason === 'app-only' && (
                        <>
                          {' '}
                          <a href={APP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                            Get the app
                          </a>
                        </>
                      )}
                      {access.reason === 'sign-in-required' && (
                        <>
                          {' '}
                          <Link to="/login" className="font-medium text-primary hover:underline">
                            Sign in
                          </Link>
                        </>
                      )}
                    </span>
                  </p>
                )}
                {releasesQuery.isError && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Couldn't check who's sharing this weekend.{' '}
                    <button onClick={() => void releasesQuery.refetch()} className="font-medium text-primary hover:underline">
                      Try again
                    </button>
                  </p>
                )}
                <ul className="mt-3 space-y-2.5">
                  {sessions.map((slot) => (
                    <SessionRow
                      key={slot.key}
                      year={year}
                      round={round}
                      slot={slot}
                      releases={releasesQuery.data ? releasesFor(releasesQuery.data, slot.key) : undefined}
                      searching={releasesQuery.isLoading}
                      canWatch={access.premium || access.loading}
                      onDownload={() => openDownload(slot.key)}
                    />
                  ))}
                </ul>
              </section>

              <aside className="space-y-6">
                {raceRun && race.winner && (
                  <section aria-labelledby="f1-result">
                    <div className="flex items-center justify-between gap-3">
                      <h2 id="f1-result" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Result
                      </h2>
                      <ResultsToggle show={showResults} onChange={setShowResults} />
                    </div>
                    <div className="mt-3 rounded-xl border border-border/60 bg-secondary/25 p-4">
                      {showResults ? (
                        <WinnerLine winner={race.winner} />
                      ) : (
                        <p className="text-sm text-muted-foreground">Hidden, so the race isn't spoilt.</p>
                      )}
                    </div>
                  </section>
                )}
                <nav aria-label="Other races" className="grid grid-cols-2 gap-2.5">
                  {prev ? (
                    <Link
                      to={f1RacePath(year, prev.round)}
                      className="rounded-xl border border-border/60 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-secondary/40"
                    >
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Round {prev.round}
                      </span>
                      <span className="mt-1 block truncate font-medium">{prev.name}</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link
                      to={f1RacePath(year, next.round)}
                      className="rounded-xl border border-border/60 p-3 text-right text-sm transition-colors hover:border-primary/40 hover:bg-secondary/40"
                    >
                      <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        Round {next.round} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="mt-1 block truncate font-medium">{next.name}</span>
                    </Link>
                  )}
                </nav>
              </aside>
            </div>
          ) : (
            <div className="space-y-2.5" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}
        </main>
      </F1Chrome>

      <DownloadSheet target={download} onOpenChange={(open) => !open && setDownload(null)} />
    </>
  )
}

/** "Sat 6 Dec, 18:00" in the viewer's time when the start time is known, else the day. */
function sessionWhen(slot: F1SessionSlot): string {
  const at = startsAt(slot)
  if (at === null) return ''
  if (!slot.time) return formatF1Date(slot.date)
  return new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "3 to choose from · up to 4K" */
function releaseSummary(releases: F1Release[]): string {
  const order = ['4K', '1080p', '720p', '480p', 'SD']
  const best = releases.map((r) => parseTorrentQuality(r.name)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
  return `${releases.length} ${releases.length === 1 ? 'copy' : 'copies'}${best && best !== 'SD' ? ` · up to ${best}` : ''}`
}

function SessionRow({
  year,
  round,
  slot,
  releases,
  searching,
  canWatch,
  onDownload,
}: {
  year: number
  round: number
  slot: F1SessionSlot
  releases: F1Release[] | undefined
  searching: boolean
  canWatch: boolean
  onDownload: () => void
}) {
  const label = sessionLabel(slot.key, year)
  const upcoming = isUpcoming(slot)
  const none = releases !== undefined && releases.length === 0
  // A copy nobody seeds can still be in Premium's cache, but a torrent app would wait on it forever
  const shared = releases === undefined || releases.some((r) => Number(r.seeders) > 0)
  const status = upcoming ? 'Not run yet' : searching ? 'Looking for copies…' : releases ? (none ? 'Nobody is sharing it yet' : releaseSummary(releases)) : ''
  const when = sessionWhen(slot)
  // An empty list may just be out of date: the player searches again itself
  const watchable = !upcoming && canWatch

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-secondary/25 p-3.5 sm:p-4',
        slot.key === 'race' && 'border-primary/30 bg-primary/[0.06]'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{[when, status].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {watchable ? (
          <Button asChild size="sm" className="rounded-full">
            <Link to={`/f1/${year}/${round}/${slot.key}`} aria-label={`Watch ${label}`}>
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Watch
            </Link>
          </Button>
        ) : (
          <Button size="sm" className="rounded-full" disabled aria-label={`Watch ${label}`}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Watch
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={onDownload}
          disabled={upcoming || none || !shared}
          title={!upcoming && !none && !shared ? 'Nobody is sharing it right now' : undefined}
          aria-label={`Download ${label}`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Download</span>
        </Button>
      </div>
    </li>
  )
}

export default F1Race
