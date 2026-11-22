import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Download, Flag, Lock, Play, Trophy } from 'lucide-react'
import { DownloadSheet, type DownloadTarget } from '@/components/downloads/DownloadSheet'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { parseTorrentQuality } from '@/lib/debridApi'
import { cn } from '@/lib/utils'
import {
  countryCode,
  defaultSeasonYear,
  f1PremiumNote,
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
import { Button, EmptyState, ListRow, ListSection, NavBar, Switch, useBack } from '@app/components/kit'

/** The short badge each session gets in the list. */
const SESSION_BADGE: Record<F1Session, string> = {
  fp1: 'P1',
  fp2: 'P2',
  fp3: 'P3',
  'sprint-qualifying': 'SQ',
  sprint: 'S',
  qualifying: 'Q',
  race: 'R',
}

/** One race weekend: a header in racing red, then its sessions — each to watch on Premium or download. */
export function F1RaceScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const year = Number(params.year)
  const round = Number(params.round)
  const queryClient = useQueryClient()
  const access = usePremiumAccess()
  const [showResults, setShowResults] = useF1ShowResults()
  const [download, setDownload] = useState<DownloadTarget | null>(null)
  const seasonLink = year === defaultSeasonYear() ? '/f1' : `/f1?season=${year}`
  const back = useBack(seasonLink)

  const { data: season, isLoading, isError, refetch } = useQuery(f1SeasonQuery(year))
  const race = season?.races.find((r) => r.round === round)
  const releasesQuery = useQuery({ ...f1ReleasesQuery(year, round), enabled: !!race })
  const index = season && race ? season.races.indexOf(race) : -1
  const prev = index > 0 ? season?.races[index - 1] : undefined
  const next = season && index >= 0 ? season.races[index + 1] : undefined
  const sessions = useMemo(() => (race ? sessionsToList(race, releasesQuery.data) : []), [race, releasesQuery.data])

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

  if (isError || (season && !race)) {
    return (
      <div className="px-4 pb-tabbar pt-page lg:px-12">
        <NavBar title="Formula 1" back backTo={seasonLink} />
        <EmptyState
          icon={<Flag />}
          title={isError ? "The calendar didn't load" : `No round ${round} in ${year}`}
          text={isError ? 'Check your connection and try again.' : 'That race isn’t on the calendar.'}
          action={
            <Button variant="tinted" onClick={() => (isError ? void refetch() : navigate(seasonLink))}>
              {isError ? 'Try Again' : 'See the Season'}
            </Button>
          }
        />
      </div>
    )
  }

  const note = access.loading ? '' : f1PremiumNote(access.reason)
  const raceRun = race ? !isUpcoming({ date: race.date, time: race.time }) : false
  const firstDay = sessions.find((s) => s.date)?.date ?? null
  const shortName = race?.name.replace(/ Grand Prix\b/, ' GP') ?? 'Formula 1'

  return (
    <div className="pb-tabbar">
      <NavBar title={shortName} back backTo={seasonLink} threshold={180} />

      {/* Header: racing red, the country's code behind the name */}
      <header className="relative overflow-hidden bg-[#121217] lg:mx-12 lg:mt-[calc(var(--topbar-h)+24px)] lg:rounded-[22px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(225,6,0,0.6)_0%,rgba(225,6,0,0.14)_45%,transparent_72%)]" />
        {race && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-3 bottom-[-28px] select-none text-[150px] font-black leading-none tracking-tighter text-white/[0.07] lg:text-[220px]"
          >
            {countryCode(race.country)}
          </span>
        )}
        <div className="relative px-5 pb-7 pt-[calc(var(--sat)+var(--navbar-h)+12px)] lg:px-9 lg:pb-9 lg:pt-8">
          <button onClick={back} className="mb-4 hidden items-center gap-1 text-[14px] font-medium text-white/70 hover:text-white lg:inline-flex">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.4} /> {year} season
          </button>
          {race ? (
            <>
              <p className="t-caption font-semibold uppercase tracking-[0.14em] text-white/70">
                Round {race.round} · {firstDay && firstDay !== race.date ? `${formatF1Date(firstDay, { year: false })} – ` : ''}
                {formatF1Date(race.date)}
              </p>
              <h1 className="mt-1.5 text-[32px] font-bold leading-[1.08] tracking-tight text-white lg:text-[44px]">{race.name}</h1>
              <p className="t-subhead mt-2 text-white/70">
                {[race.circuit, [race.locality, race.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <div className="h-[120px]" aria-busy="true" />
          )}
        </div>
      </header>

      <div className="px-4 pt-6 lg:px-12 lg:pt-8">
        {isLoading || !race ? (
          <div className="glass-card h-[340px] animate-pulse rounded-[16px]" aria-busy="true" />
        ) : (
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,880px)_360px]">
            <div>
              {note && (
                <div className="glass-card t-footnote mb-5 flex items-start gap-2.5 rounded-[14px] p-3.5 text-label-2">
                  <Lock className="mt-px h-4 w-4 shrink-0" />
                  <span>
                    {note}{' '}
                    {(access.reason === 'not-approved' || access.reason === 'sign-in-required') && (
                      <Link to="/premium" className="font-semibold text-tint">
                        Ask for Premium
                      </Link>
                    )}
                  </span>
                </div>
              )}

              <section className="mb-7">
                <h2 className="t-footnote mb-1.5 px-4 uppercase tracking-[0.02em] text-label-2">Sessions</h2>
                <ul className="glass-card overflow-hidden rounded-[16px]">
                  {sessions.map((slot) => (
                    <SessionRow
                      key={slot.key}
                      year={year}
                      round={round}
                      slot={slot}
                      releases={releasesQuery.data ? releasesFor(releasesQuery.data, slot.key) : undefined}
                      searching={releasesQuery.isLoading}
                      premium={access.premium || access.loading}
                      onDownload={() => openDownload(slot.key)}
                    />
                  ))}
                </ul>
                <p className="t-footnote mt-1.5 px-4 text-label-2">
                  {releasesQuery.isError ? (
                    <button onClick={() => void releasesQuery.refetch()} className="text-tint">
                      Couldn’t check who’s sharing this weekend — try again
                    </button>
                  ) : (
                    'Watch streams on Premium. Download opens a magnet link in your torrent app.'
                  )}
                </p>
              </section>
            </div>

            <div>
              {raceRun && race.winner && (
                <ListSection header="Result" footer={showResults ? undefined : 'Hidden, so the race isn’t spoilt.'}>
                  <ListRow label="Show the winner" trailing={<Switch checked={showResults} onChange={setShowResults} label="Show the winner" />} />
                  {showResults && (
                    <ListRow icon={<Trophy className="h-5 w-5 shrink-0 text-ios-yellow" />} label={race.winner.driver} detail={race.winner.team || undefined} />
                  )}
                </ListSection>
              )}

              {(prev || next) && (
                <ListSection header="More races">
                  {prev && (
                    <ListRow
                      to={`/f1/${year}/${prev.round}`}
                      icon={<CodeTile code={countryCode(prev.country)} sub={`R${prev.round}`} />}
                      label={prev.name.replace(/ Grand Prix\b/, ' GP')}
                      detail={`Previous · ${formatF1Date(prev.date, { year: false })}`}
                    />
                  )}
                  {next && (
                    <ListRow
                      to={`/f1/${year}/${next.round}`}
                      icon={<CodeTile code={countryCode(next.country)} sub={`R${next.round}`} />}
                      label={next.name.replace(/ Grand Prix\b/, ' GP')}
                      detail={`Next · ${formatF1Date(next.date, { year: false })}`}
                    />
                  )}
                </ListSection>
              )}
            </div>
          </div>
        )}
      </div>

      <DownloadSheet target={download} onOpenChange={(open) => !open && setDownload(null)} />
    </div>
  )
}

function CodeTile({ code, sub }: { code: string; sub: string }) {
  return (
    <span className="flex h-[34px] w-[38px] shrink-0 flex-col items-center justify-center rounded-[9px] bg-fill">
      <span className="text-[11px] font-extrabold leading-none tracking-wide text-white">{code}</span>
      <span className="mt-[3px] text-[9px] font-semibold leading-none text-white/50">{sub}</span>
    </span>
  )
}

function sessionWhen(slot: F1SessionSlot): string {
  const at = startsAt(slot)
  if (at === null) return ''
  if (!slot.time) return formatF1Date(slot.date, { year: false })
  return new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "9 copies · 4K" */
function releaseSummary(releases: F1Release[]): string {
  const order = ['4K', '1080p', '720p', '480p', 'SD']
  const best = releases.map((r) => parseTorrentQuality(r.name)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
  return `${releases.length} ${releases.length === 1 ? 'copy' : 'copies'}${best && best !== 'SD' ? ` · ${best}` : ''}`
}

function SessionRow({
  year,
  round,
  slot,
  releases,
  searching,
  premium,
  onDownload,
}: {
  year: number
  round: number
  slot: F1SessionSlot
  releases: F1Release[] | undefined
  searching: boolean
  premium: boolean
  onDownload: () => void
}) {
  const navigate = useNavigate()
  const label = sessionLabel(slot.key, year)
  const upcoming = isUpcoming(slot)
  const none = releases !== undefined && releases.length === 0
  // A copy nobody seeds can still be in Premium's cache, but a torrent app would wait on it forever
  const shared = releases !== undefined && releases.some((r) => Number(r.seeders) > 0)
  const isRace = slot.key === 'race'
  const status = upcoming ? 'Not run yet' : searching ? 'Looking for copies…' : none ? 'Nobody is sharing it yet' : releases ? releaseSummary(releases) : ''
  // An empty list may just be out of date: the player searches again itself
  const available = !upcoming && !none

  return (
    <li
      className={cn('cell-sep-inset relative flex min-h-[66px] items-center gap-3 px-4 py-3', !available && !searching && 'opacity-60')}
      style={{ '--sep-inset': '68px' } as React.CSSProperties}
    >
      <span
        className={cn(
          'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[11px] text-[14px] font-extrabold tracking-wide',
          isRace ? 'bg-[#e10600] text-white' : 'bg-fill text-white/90'
        )}
        aria-hidden="true"
      >
        {SESSION_BADGE[slot.key]}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('t-body block truncate', isRace && 'font-semibold')}>{label}</span>
        <span className="t-footnote mt-0.5 block truncate text-label-2">{sessionWhen(slot)}</span>
        {status && <span className={cn('t-caption mt-0.5 block truncate', available && releases ? 'text-ios-green' : 'text-label-3')}>{status}</span>}
      </span>

      {!upcoming && (
        <span className="flex shrink-0 items-center gap-2">
          {shared && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={`Download ${label}`}
              className="press flex h-[34px] w-[34px] items-center justify-center rounded-full bg-fill text-white"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {available &&
            (premium ? (
              <Button
                size="sm"
                variant={isRace ? 'primary' : 'gray'}
                className="h-[34px] px-4"
                onClick={() => navigate(`/watch/f1/${year}/${round}/${slot.key}`)}
                aria-label={`Watch ${label}`}
              >
                <Play className="fill-current" /> Watch
              </Button>
            ) : (
              <Button size="sm" variant="gray" className="h-[34px] px-3.5" onClick={() => navigate('/premium')} aria-label={`Watch ${label} with Premium`}>
                <Lock /> Premium
              </Button>
            ))}
        </span>
      )}
    </li>
  )
}
