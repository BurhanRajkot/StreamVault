import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Download } from 'lucide-react'
import { PageMeta } from '@/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { PremiumPane } from '@/components/player/PremiumPane'
import { DownloadSheet, type DownloadTarget } from '@/components/downloads/DownloadSheet'
import { F1Chrome, f1Gutter } from '@/components/f1/F1Parts'
import { cn } from '@/lib/utils'
import {
  F1_ELSEWHERE,
  SESSION_MINUTES,
  f1RacePath,
  f1ReleaseSource,
  f1ReleasesQuery,
  f1SeasonQuery,
  isF1Session,
  isUpcoming,
  releasesFor,
  sessionLabel,
} from '@/lib/f1'

/**
 * One F1 session on Premium. On a phone the player takes the whole screen
 * (index.css .player-shell), as a film's does.
 */
const F1Watch = () => {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const year = Number(params.year)
  const round = Number(params.round)
  const session = isF1Session(params.session) ? params.session : null
  const [download, setDownload] = useState<DownloadTarget | null>(null)

  const { data: season, isError } = useQuery(f1SeasonQuery(year))
  const race = season?.races.find((r) => r.round === round)
  const source = useMemo(() => (session ? f1ReleaseSource(queryClient, year, round, session) : null), [queryClient, year, round, session])
  const back = () => navigate(f1RacePath(year, round))

  if (!session || (season && !race)) {
    return (
      <F1Chrome>
        <main className={`${f1Gutter} flex-1 pt-[calc(var(--sv-header-h)+5rem)] text-center`}>
          <p className="text-sm text-muted-foreground">
            That session isn't in the archive.{' '}
            <Link to="/f1" className="font-medium text-primary hover:underline">
              Back to F1
            </Link>
          </p>
        </main>
      </F1Chrome>
    )
  }

  const label = sessionLabel(session, year)
  const subtitle = `${year} · ${label}`

  return (
    <>
      <PageMeta title={race ? `${race.name} ${year} · ${label}` : `Formula 1 ${year}`} noindex />
      <F1Chrome>
        <main className={`${f1Gutter} flex-1 pb-tabbar pt-[calc(var(--sv-header-h)+1rem)] md:pt-[calc(var(--sv-header-h)+1.5rem)]`}>
          <div className="player-column flex min-w-0 flex-col gap-4">
            <Link to={f1RacePath(year, round)} className="player-hide-chrome inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {race?.name ?? 'Back'}
            </Link>

            <div data-own-controls className="player-shell relative w-full overflow-hidden bg-black">
              {/* Phones: the page's back button over the picture */}
              <div className="player-chrome-top pointer-events-none z-[110] items-center gap-2 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
                <button
                  onClick={back}
                  aria-label="Back to the race"
                  className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors active:bg-white/10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div className="player-chrome-title min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-white">{race?.name}</p>
                  <p className="truncate text-xs text-white/55">{subtitle}</p>
                </div>
              </div>

              <div className="player-frame">
                {race && source ? (
                  <PremiumPane
                    key={source.key}
                    title={race.name}
                    year={year}
                    mediaType="movie"
                    subtitle={subtitle}
                    releaseSource={source}
                    runtimeMinutes={SESSION_MINUTES[session]}
                    onSwitchServer={back}
                    onBack={back}
                    exitLabel="Back to the race"
                    elsewhere={F1_ELSEWHERE}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">
                    {isError ? 'The calendar didn’t load — go back and try again.' : <span className="player-spinner" aria-label="Loading" />}
                  </div>
                )}
              </div>
            </div>

            {race && (
              <div className="player-hide-chrome flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{race.name}</h1>
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() =>
                    setDownload({
                      id: `f1:${year}:${round}:${session}`,
                      title: `${race.name} ${year}`,
                      mediaType: 'movie',
                      label,
                      releases: async () => releasesFor(await queryClient.fetchQuery(f1ReleasesQuery(year, round)), session),
                    })
                  }
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </Button>
                <nav aria-label="Sessions" className="flex w-full flex-wrap gap-2">
                  {race.sessions
                    .filter((s) => !isUpcoming(s))
                    .map((s) => (
                      <Link
                        key={s.key}
                        to={`/f1/${year}/${round}/${s.key}`}
                        aria-current={s.key === session ? 'page' : undefined}
                        className={cn(
                          'h-9 rounded-full border px-4 text-[13px] font-semibold leading-9 transition-colors',
                          s.key === session
                            ? 'border-transparent bg-foreground text-background'
                            : 'border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {sessionLabel(s.key, year)}
                      </Link>
                    ))}
                </nav>
              </div>
            )}
          </div>
        </main>
      </F1Chrome>

      <DownloadSheet target={download} onOpenChange={(open) => !open && setDownload(null)} />
    </>
  )
}

export default F1Watch
