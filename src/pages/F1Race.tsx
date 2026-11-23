import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, ChevronRight, Download, Lock, MapPin, Play } from 'lucide-react'
import { PageMeta } from '@/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { DownloadSheet, type DownloadTarget } from '@/components/downloads/DownloadSheet'
import { F1Chrome, ResultsToggle, WinnerLine, f1Gutter } from '@/components/f1/F1Parts'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { useF1HeadStart } from '@/hooks/useF1HeadStart'
import { parseTorrentQuality } from '@/lib/debridApi'
import { cn } from '@/lib/utils'
import {
  SESSION_BADGE,
  countryCode,
  defaultSeasonYear,
  f1PremiumNote,
  f1RacePath,
  f1ReleasesQuery,
  f1SeasonQuery,
  formatF1Date,
  isUpcoming,
  releaseSummary,
  releasesFor,
  sessionLabel,
  sessionTime,
  sessionsByDay,
  sessionsToList,
  shortRaceName,
  weekendDates,
  type F1Race as F1RaceData,
  type F1Release,
  type F1Session,
  type F1SessionSlot,
} from '@/lib/f1'

const APP_DOWNLOAD_URL = 'https://github.com/dragon-manner/StreamVault/releases/latest'

/** One race weekend: its sessions, day by day, each to watch (Premium) or download (magnet links). */
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
  const days = useMemo(() => sessionsByDay(sessions), [sessions])
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
  useF1HeadStart(year, raceRun ? round : undefined)

  return (
    <>
      <PageMeta
        title={race ? `${race.name} ${year}` : `Formula 1 ${year}`}
        description={race ? `Watch or download every session of the ${year} ${race.name} — practice, qualifying and the race.` : undefined}
      />
      <F1Chrome>
        {/* Header: racing red, the country's code behind the name */}
        <header className="relative overflow-hidden border-b border-white/[0.06] bg-[#111116] pt-[var(--sv-header-h)] text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_150%_at_100%_0%,rgba(225,6,0,0.55)_0%,rgba(225,6,0,0.12)_45%,transparent_72%)]" />
          {race && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-8 right-0 select-none text-[120px] font-black leading-none tracking-tighter text-white/[0.07] sm:text-[220px]"
            >
              {countryCode(race.country)}
            </span>
          )}
          <div className={`${f1Gutter} relative py-6 sm:py-10`}>
            <div className="flex items-center justify-between gap-3">
              <Link to={seasonLink} className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {year} season
              </Link>
              <nav aria-label="Other races" className="flex gap-2">
                <RoundLink year={year} race={prev} dir="prev" />
                <RoundLink year={year} race={next} dir="next" />
              </nav>
            </div>
            {race ? (
              <>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  Round {race.round} · {weekendDates(race)}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{race.name}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-white/70">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{[race.circuit, race.locality, race.country].filter(Boolean).join(' · ')}</span>
                </p>
              </>
            ) : isLoading ? (
              <div className="mt-6 h-12 w-72 max-w-full animate-pulse rounded-lg bg-white/10" />
            ) : null}
          </div>
        </header>

        <main className={`${f1Gutter} flex-1 py-6 pb-tabbar sm:py-10`}>
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
              <section aria-labelledby="f1-sessions" className="min-w-0">
                <h2 id="f1-sessions" className="sr-only">
                  Sessions
                </h2>
                {note && (
                  <p className="mb-5 flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">
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
                  <p className="mb-5 text-sm text-muted-foreground">
                    Couldn't check who's sharing this weekend.{' '}
                    <button onClick={() => void releasesQuery.refetch()} className="font-medium text-primary hover:underline">
                      Try again
                    </button>
                  </p>
                )}
                <div className="space-y-7">
                  {days.map((day) => (
                    <div key={day.key}>
                      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{day.label ?? 'Sessions'}</h3>
                      <ul className="space-y-2.5">
                        {day.sessions.map((slot) => (
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
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-xs text-muted-foreground">
                  Times are in your time zone. Watch streams on Premium; Download opens a magnet link in your torrent app.
                </p>
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
                <section aria-labelledby="f1-weekend" className="rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <h2 id="f1-weekend" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    The weekend
                  </h2>
                  <dl className="mt-3 space-y-2 text-sm">
                    <Fact label="Circuit" value={race.circuit} />
                    <Fact label="Where" value={[race.locality, race.country].filter(Boolean).join(', ')} />
                    <Fact label="Race day" value={formatF1Date(race.date)} />
                    <Fact label="Format" value={race.sessions.some((s) => s.key === 'sprint') ? 'Sprint weekend' : 'Standard weekend'} />
                  </dl>
                </section>
              </aside>
            </div>
          ) : (
            <div className="space-y-2.5" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          )}
        </main>
      </F1Chrome>

      <DownloadSheet target={download} onOpenChange={(open) => !open && setDownload(null)} />
    </>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  )
}

/** The round before or after, as a small button in the header. */
function RoundLink({ year, race, dir }: { year: number; race: F1RaceData | undefined; dir: 'prev' | 'next' }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  const base = 'inline-flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-semibold text-white'
  if (!race) {
    return (
      <span className={cn(base, 'opacity-35')} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
    )
  }
  return (
    <Link
      to={f1RacePath(year, race.round)}
      className={cn(base, 'transition-colors hover:bg-white/20')}
      aria-label={`${dir === 'prev' ? 'Previous' : 'Next'}: ${race.name}`}
      title={race.name}
    >
      {dir === 'prev' && <Icon className="h-4 w-4" aria-hidden="true" />}
      <span className="max-sm:hidden">{shortRaceName(race.name)}</span>
      <span className="sm:hidden">R{race.round}</span>
      {dir === 'next' && <Icon className="h-4 w-4" aria-hidden="true" />}
    </Link>
  )
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
  const status = upcoming
    ? 'Not run yet'
    : searching
      ? 'Looking for copies…'
      : releases
        ? none
          ? 'Nobody is sharing it yet'
          : releaseSummary(releases, parseTorrentQuality)
        : ''
  const time = sessionTime(slot)
  const isRace = slot.key === 'race'
  // An empty list may just be out of date: the player searches again itself
  const watchable = !upcoming && canWatch

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/25 p-3.5 sm:p-4',
        isRace && 'border-[#e10600]/40 bg-[#e10600]/[0.07]'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold tracking-wide',
            isRace ? 'bg-[#e10600] text-white' : 'bg-foreground/[0.08] text-foreground/90'
          )}
          aria-hidden="true"
        >
          {SESSION_BADGE[slot.key]}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xs">
            {time && <span className="tabular-nums text-foreground/80">{time}</span>}
            {time && status && <span className="text-muted-foreground"> · </span>}
            {status && <span className={!upcoming && releases && !none ? 'text-emerald-500' : 'text-muted-foreground'}>{status}</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {watchable ? (
          <Button asChild size="sm" className={cn('rounded-full', isRace && 'bg-[#e10600] text-white hover:bg-[#c00500]')}>
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
