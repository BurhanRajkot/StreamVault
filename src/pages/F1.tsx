import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Flag } from 'lucide-react'
import { PageMeta } from '@/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { F1Chrome, LatestRaceHero, NextRaceCard, RaceCard, ResultsToggle, SeasonSelect, f1Gutter } from '@/components/f1/F1Parts'
import { FIRST_F1_SEASON, defaultSeasonYear, f1SeasonQuery, latestRace, nextRace } from '@/lib/f1'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { useF1HeadStart } from '@/hooks/useF1HeadStart'

/**
 * The F1 archive: one season's race weekends. A race opens its sessions —
 * practice, qualifying, sprints, the race — to watch (Premium) or download.
 */
const F1 = () => {
  const [params, setParams] = useSearchParams()
  const fallback = defaultSeasonYear()
  const asked = Number(params.get('season'))
  const year = Number.isInteger(asked) && asked >= FIRST_F1_SEASON && asked <= new Date().getFullYear() ? asked : fallback
  const [showResults, setShowResults] = useF1ShowResults()
  const { data: season, isLoading, isError, refetch } = useQuery(f1SeasonQuery(year))

  const setYear = (next: number) =>
    setParams(
      (prev) => {
        if (next === fallback) prev.delete('season')
        else prev.set('season', String(next))
        return prev
      },
      { replace: true }
    )

  const races = season?.races ?? []
  const latest = season ? latestRace(season) : null
  const next = season ? nextRace(season) : null
  const done = latest ? races.indexOf(latest) + 1 : 0
  const access = usePremiumAccess()
  useF1HeadStart(year, latest?.round)

  return (
    <>
      <PageMeta
        title={`Formula 1 ${year}`}
        description={`Every race weekend of the ${year} Formula 1 season — practice, qualifying, sprints and races, to watch or download.`}
      />
      <F1Chrome>
        <div className="border-b border-border/50 pt-[var(--sv-header-h)]">
          <div className={`${f1Gutter} flex flex-wrap items-end justify-between gap-4 py-5 sm:py-8`}>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                Formula 1
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{year} season</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {races.length > 0 ? `${races.length} race weekends · ` : ''}practice, qualifying, sprints and races
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SeasonSelect year={year} onChange={setYear} />
              <ResultsToggle show={showResults} onChange={setShowResults} />
            </div>
          </div>
        </div>

        <main className={`${f1Gutter} flex-1 py-5 pb-tabbar sm:py-8`}>
          {isError ? (
            <div className="flex flex-col items-center px-4 py-20 text-center">
              <AlertCircle className="h-6 w-6 text-destructive/70" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">The calendar didn't load</h2>
              <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
              <Button onClick={() => void refetch()} variant="outline" size="sm" className="mt-5">
                Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div aria-busy="true">
              <div className="mb-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="h-[280px] animate-pulse rounded-3xl bg-muted" />
                <div className="hidden h-[280px] animate-pulse rounded-3xl bg-muted lg:block" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[108px] animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            </div>
          ) : races.length === 0 || !season ? (
            <p className="py-20 text-center text-sm text-muted-foreground">The {year} calendar isn't out yet.</p>
          ) : (
            <>
              {(latest || next) && (
                <div className={`mb-10 grid gap-4 ${latest && next ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
                  {latest && <LatestRaceHero year={year} race={latest} finale={!next} showResults={showResults} canWatch={access.premium} />}
                  {next && <NextRaceCard year={year} race={next} />}
                </div>
              )}
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Calendar</h2>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {done} of {races.length} run
                </p>
              </div>
              {/* How far into the season */}
              <div className="mb-5 h-1 overflow-hidden rounded-full bg-foreground/[0.07]" aria-hidden="true">
                <div className="h-full rounded-full bg-[#e10600]" style={{ width: `${(done / races.length) * 100}%` }} />
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {races.map((race) => (
                  <li key={race.round} className="min-w-0">
                    <RaceCard year={year} race={race} season={season} showResults={showResults} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </F1Chrome>
    </>
  )
}

export default F1
