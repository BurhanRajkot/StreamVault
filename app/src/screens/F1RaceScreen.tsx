import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Flag, Lock, Play, Trophy } from 'lucide-react'
import { DownloadSheet, type DownloadTarget } from '@/components/downloads/DownloadSheet'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { parseTorrentQuality } from '@/lib/debridApi'
import { cn } from '@/lib/utils'
import {
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
import { PageHeader } from '@app/components/PageHeader'
import { Button, EmptyState, ListRow, ListSection, Switch } from '@app/components/kit'

/** One race weekend: its sessions, each to watch on Premium or download as a magnet link. */
export function F1RaceScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const year = Number(params.year)
  const round = Number(params.round)
  const queryClient = useQueryClient()
  const access = usePremiumAccess()
  const [showResults, setShowResults] = useF1ShowResults()
  const [download, setDownload] = useState<DownloadTarget | null>(null)

  const { data: season, isLoading, isError, refetch } = useQuery(f1SeasonQuery(year))
  const race = season?.races.find((r) => r.round === round)
  const releasesQuery = useQuery({ ...f1ReleasesQuery(year, round), enabled: !!race })
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

  if (isError || (season && !race)) {
    return (
      <div className="px-4 pb-tabbar pt-page lg:px-12">
        <PageHeader back backTo={seasonLink} title="Formula 1" />
        <EmptyState
          icon={<Flag />}
          title={isError ? "The calendar didn't load" : `No round ${round} in ${year}`}
          text={isError ? 'Check your connection and try again.' : 'That race isn’t on the calendar.'}
          action={
            isError ? (
              <Button variant="tinted" onClick={() => void refetch()}>
                Try Again
              </Button>
            ) : (
              <Button variant="tinted" onClick={() => navigate(seasonLink)}>
                See the Season
              </Button>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader
        back
        backTo={seasonLink}
        title={race?.name ?? 'Formula 1'}
        subtitle={
          race ? (
            <>
              Round {race.round} · {[race.circuit, race.locality, race.country].filter(Boolean).join(', ')}
              <br />
              {firstDay && firstDay !== race.date ? `${formatF1Date(firstDay, { year: false })} – ` : ''}
              {formatF1Date(race.date)}
            </>
          ) : undefined
        }
      />

      {isLoading || !race ? (
        <div className="glass-card h-[300px] animate-pulse rounded-[16px]" aria-busy="true" />
      ) : (
        <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            {note && (
              <div className="glass-card t-footnote mb-4 flex items-start gap-2.5 rounded-[14px] p-3.5 text-label-2">
                <Lock className="mt-px h-4 w-4 shrink-0" />
                <span>
                  {note}
                  {(access.reason === 'not-approved' || access.reason === 'sign-in-required') && (
                    <>
                      {' '}
                      <Link to="/premium" className="font-semibold text-tint">
                        Ask for Premium
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}

            <ListSection
              header="Sessions"
              footer={
                releasesQuery.isError ? (
                  <button onClick={() => void releasesQuery.refetch()} className="text-tint">
                    Couldn’t check who’s sharing this weekend — try again
                  </button>
                ) : (
                  'Downloads open in a torrent app. Watching streams from Premium.'
                )
              }
            >
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
            </ListSection>
          </div>

          <div>
            {raceRun && race.winner && (
              <ListSection header="Result" footer={showResults ? undefined : 'Hidden, so the race isn’t spoilt.'}>
                <ListRow label="Show the winner" trailing={<Switch checked={showResults} onChange={setShowResults} label="Show the winner" />} />
                {showResults && (
                  <ListRow
                    icon={<Trophy className="h-5 w-5 shrink-0 text-ios-yellow" />}
                    label={race.winner.driver}
                    detail={race.winner.team || undefined}
                  />
                )}
              </ListSection>
            )}

            {(prev || next) && (
              <ListSection header="More races">
                {prev && (
                  <ListRow
                    to={`/f1/${year}/${prev.round}`}
                    icon={<ChevronLeft className="h-5 w-5 shrink-0 text-label-2" />}
                    label={prev.name}
                    detail={`Round ${prev.round} · ${formatF1Date(prev.date)}`}
                    accessory="none"
                  />
                )}
                {next && (
                  <ListRow
                    to={`/f1/${year}/${next.round}`}
                    icon={<ChevronRight className="h-5 w-5 shrink-0 text-label-2" />}
                    label={next.name}
                    detail={`Round ${next.round} · ${formatF1Date(next.date)}`}
                    accessory="none"
                  />
                )}
              </ListSection>
            )}
          </div>
        </div>
      )}

      <DownloadSheet target={download} onOpenChange={(open) => !open && setDownload(null)} />
    </div>
  )
}

function sessionWhen(slot: F1SessionSlot): string {
  const at = startsAt(slot)
  if (at === null) return ''
  if (!slot.time) return formatF1Date(slot.date)
  return new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

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
  const navigate = useNavigate()
  const label = sessionLabel(slot.key, year)
  const upcoming = isUpcoming(slot)
  const none = releases !== undefined && releases.length === 0
  // A copy nobody seeds can still be in Premium's cache, but a torrent app would wait on it forever
  const shared = releases === undefined || releases.some((r) => Number(r.seeders) > 0)
  const status = upcoming ? 'Not run yet' : searching ? 'Looking for copies…' : releases ? (none ? 'Nobody is sharing it yet' : releaseSummary(releases)) : ''
  const watchable = !upcoming && !none && canWatch

  return (
    <ListRow
      label={<span className={cn(slot.key === 'race' && 'font-semibold')}>{label}</span>}
      detail={[sessionWhen(slot), status].filter(Boolean).join(' · ')}
      accessory="none"
      trailing={
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={upcoming || none || !shared}
            aria-label={`Download ${label}`}
            className="press flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-white disabled:opacity-35"
          >
            <Download className="h-4 w-4" />
          </button>
          <Button size="sm" variant="tinted" disabled={!watchable} onClick={() => navigate(`/watch/f1/${year}/${round}/${slot.key}`)} aria-label={`Watch ${label}`}>
            <Play className="fill-current" /> Watch
          </Button>
        </span>
      }
    />
  )
}
