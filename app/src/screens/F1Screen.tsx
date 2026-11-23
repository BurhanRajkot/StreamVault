import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronRight, Eye, EyeOff, Flag, Play, Timer, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { useF1HeadStart } from '@/hooks/useF1HeadStart'
import {
  FIRST_F1_SEASON,
  countdown,
  countryCode,
  defaultSeasonYear,
  f1SeasonQuery,
  formatF1Date,
  latestRace,
  nextRace,
  raceState,
  seasonYears,
  sessionLabel,
  sessionTime,
  shortRaceName,
  weekendDates,
  weekendStart,
  type F1Race,
  type F1Season,
} from '@/lib/f1'
import { spring } from '@app/lib/motion'
import { Button, EmptyState, LargeTitle, NavBar } from '@app/components/kit'
import { Sheet } from '@app/components/Sheet'

/** Seasons offered as chips; the rest are a tap on "Earlier" away. */
const RECENT_SEASONS = 6

/**
 * The F1 archive: one season — its latest race up top, ready to play, the
 * next one counting down beside it, then the whole calendar. A race opens
 * its sessions.
 */
export function F1Screen() {
  const [params, setParams] = useSearchParams()
  const fallback = defaultSeasonYear()
  const asked = Number(params.get('season'))
  const year = Number.isInteger(asked) && asked >= FIRST_F1_SEASON && asked <= new Date().getFullYear() ? asked : fallback
  const [showResults, setShowResults] = useF1ShowResults()
  const [picking, setPicking] = useState(false)
  const { data: season, isLoading, isError, refetch } = useQuery(f1SeasonQuery(year))

  const setYear = (next: number) => {
    setPicking(false)
    setParams(
      (prev) => {
        if (next === fallback) prev.delete('season')
        else prev.set('season', String(next))
        return prev
      },
      { replace: true }
    )
  }

  const all = seasonYears()
  const recent = all.slice(0, RECENT_SEASONS)
  const races = season?.races ?? []
  const latest = season ? latestRace(season) : null
  const next = season ? nextRace(season) : null
  const run = latest ? races.indexOf(latest) + 1 : 0
  useF1HeadStart(year, latest?.round)

  const toggleResults = () => setShowResults(!showResults)

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <NavBar title={`F1 ${year}`} />
      <LargeTitle
        title="Formula 1"
        subtitle={`${year} season${races.length ? ` · ${races.length} races` : ''}`}
        actions={
          <button
            type="button"
            onClick={toggleResults}
            aria-pressed={showResults}
            className="glass-button press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-white"
          >
            {showResults ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showResults ? 'Results on' : 'No spoilers'}
          </button>
        }
      />

      <nav aria-label="Seasons" className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {recent.map((y) => (
          <SeasonChip key={y} year={y} active={y === year} onPick={setYear} />
        ))}
        {!recent.includes(year) && <SeasonChip year={year} active onPick={setYear} />}
        <button onClick={() => setPicking(true)} className="glass-button press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-white">
          <CalendarDays className="h-4 w-4" /> Earlier
        </button>
      </nav>

      {isError ? (
        <EmptyState
          icon={<Flag />}
          title="The calendar didn't load"
          text="Check your connection and try again."
          action={
            <Button variant="tinted" onClick={() => void refetch()}>
              Try Again
            </Button>
          }
        />
      ) : isLoading ? (
        <div aria-busy="true">
          <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="h-[230px] animate-pulse rounded-[22px] bg-fill lg:h-[280px]" />
            <div className="glass-card h-[150px] animate-pulse rounded-[22px] lg:h-[280px]" />
          </div>
          <div className="glass-card mt-7 h-[420px] animate-pulse rounded-[16px]" />
        </div>
      ) : races.length === 0 || !season ? (
        <EmptyState icon={<CalendarDays />} title="Not out yet" text={`The ${year} calendar hasn't been published yet.`} />
      ) : (
        <>
          {(latest || next) && (
            <div className={cn('mb-7 grid gap-4', latest && next && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
              {latest && <LatestRace year={year} race={latest} finale={!next} showResults={showResults} />}
              {next && <NextRace year={year} race={next} />}
            </div>
          )}

          <section className="mb-7">
            <div className="mb-1.5 flex items-baseline justify-between px-4">
              <h2 className="t-footnote uppercase tracking-[0.02em] text-label-2">Calendar</h2>
              <span className="t-footnote tabular-nums text-label-2">
                {run} of {races.length} run
              </span>
            </div>
            <div className="mx-4 mb-2.5 h-[3px] overflow-hidden rounded-full bg-fill" aria-hidden="true">
              <div className="h-full rounded-full bg-[#e10600]" style={{ width: `${(run / races.length) * 100}%` }} />
            </div>
            <ul className="glass-card overflow-hidden rounded-[16px] lg:grid lg:grid-cols-2">
              {races.map((race) => (
                <li key={race.round} className="min-w-0">
                  <RaceRow year={year} race={race} season={season} showResults={showResults} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Sheet open={picking} onOpenChange={setPicking} title="Season" description={`Every season since ${FIRST_F1_SEASON}`}>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {all.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                'press h-10 rounded-[10px] text-[15px] font-semibold tabular-nums transition-colors',
                y === year ? 'bg-white text-black' : 'bg-fill text-white hover:bg-white/15'
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function SeasonChip({ year, active, onPick }: { year: number; active: boolean; onPick: (year: number) => void }) {
  return (
    <button
      onClick={() => onPick(year)}
      aria-pressed={active}
      className={cn('press relative flex h-8 shrink-0 items-center rounded-full px-3.5 text-[14px] font-semibold tabular-nums', active ? 'text-black' : 'glass-button text-white')}
    >
      {active && <motion.span layoutId="f1-season-pill" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
      {year}
    </button>
  )
}

/** The latest race, big, with its race and the session before it a tap away. */
function LatestRace({ year, race, finale, showResults }: { year: number; race: F1Race; finale: boolean; showResults: boolean }) {
  const navigate = useNavigate()
  const { premium, loading } = usePremiumAccess()
  const racePath = `/f1/${year}/${race.round}`
  const watch = (session: string) => navigate(premium || loading ? `/watch/f1/${year}/${race.round}/${session}` : racePath)
  const second = race.sessions.some((s) => s.key === 'sprint') ? 'sprint' : race.sessions.some((s) => s.key === 'qualifying') ? 'qualifying' : null

  return (
    <section aria-label="Latest race" className="relative flex min-h-[230px] overflow-hidden rounded-[22px] bg-[#15151a] lg:min-h-[280px]">
      {/* Racing red, fading into the card */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(225,6,0,0.6)_0%,rgba(225,6,0,0.14)_45%,transparent_72%)]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-7 -right-2 select-none text-[130px] font-black leading-none tracking-tighter text-white/[0.07] lg:text-[200px]"
      >
        {countryCode(race.country)}
      </span>

      <div className="relative flex flex-1 flex-col justify-end p-5 lg:p-8">
        <p className="t-caption font-semibold uppercase tracking-[0.14em] text-white/70">
          {finale ? 'Season finale' : 'Latest race'} · Round {race.round}
        </p>
        <h2 className="mt-1.5 text-[28px] font-bold leading-[1.1] tracking-tight text-white lg:text-[40px]">{race.name}</h2>
        <p className="t-subhead mt-1.5 text-white/70">
          {weekendDates(race)} · {[race.locality, race.country].filter(Boolean).join(', ')}
        </p>
        {showResults && race.winner && (
          <p className="t-subhead mt-2 flex items-center gap-1.5 text-white/90">
            <Trophy className="h-4 w-4 shrink-0 text-ios-yellow" /> <span className="truncate">{race.winner.driver}</span>
            {race.winner.team && <span className="truncate text-white/55">· {race.winner.team}</span>}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button onClick={() => watch('race')}>
            <Play className="fill-current" /> Watch Race
          </Button>
          {second && (
            <Button variant="glass" onClick={() => watch(second)}>
              <Play className="fill-current" /> {sessionLabel(second, year)}
            </Button>
          )}
          <Button variant="glass" onClick={() => navigate(racePath)} aria-label="All sessions">
            <span className="max-[380px]:hidden">All sessions</span> <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  )
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

/** The next race weekend: a countdown to its first session, and when each session is, in the viewer's time. */
function NextRace({ year, race }: { year: number; race: F1Race }) {
  const now = useNow(30_000)
  const start = weekendStart(race)
  const started = start !== null && start <= now
  const left = start !== null && !started ? countdown(start, now) : null

  return (
    <Link to={`/f1/${year}/${race.round}`} className="glass-card tap flex flex-col rounded-[22px] p-5" aria-label={`Up next: ${race.name}`}>
      <p className="t-caption flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-label-2">
        <Timer className="h-3.5 w-3.5" /> {started ? 'This weekend' : 'Up next'} · Round {race.round}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="t-title3 truncate font-bold text-white">{race.name}</p>
          <p className="t-footnote truncate text-label-2">
            {weekendDates(race)} · {race.locality || race.country}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-label-3" />
      </div>
      {left && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              [left.days, 'days'],
              [left.hours, 'hrs'],
              [left.minutes, 'min'],
            ] as const
          ).map(([n, unit]) => (
            <div key={unit} className="rounded-[12px] bg-fill py-2 text-center">
              <p className="text-[24px] font-bold tabular-nums leading-none text-white">{n}</p>
              <p className="t-caption2 mt-1 uppercase tracking-wider text-label-2">{unit}</p>
            </div>
          ))}
        </div>
      )}
      <ul className="t-footnote mt-4 hidden space-y-1.5 lg:block">
        {race.sessions.map((s) => (
          <li key={s.key} className="flex items-baseline justify-between gap-3">
            <span className={cn('text-label-2', s.key === 'race' && 'font-semibold text-white')}>{sessionLabel(s.key, year)}</span>
            <span className="shrink-0 tabular-nums text-white/85">
              {formatF1Date(s.date, { year: false })}
              {sessionTime(s) && ` · ${sessionTime(s)}`}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  )
}

function RaceRow({ year, race, season, showResults }: { year: number; race: F1Race; season: F1Season; showResults: boolean }) {
  const state = raceState(race, season)
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  const soon = state === 'next' || state === 'live'
  return (
    <Link
      to={`/f1/${year}/${race.round}`}
      className={cn('cell-sep-inset tap relative flex min-h-[62px] items-center gap-3 px-4 py-2.5', state === 'upcoming' && 'opacity-55')}
      style={{ '--sep-inset': '68px' } as React.CSSProperties}
    >
      <span className={cn('flex h-[38px] w-[40px] shrink-0 flex-col items-center justify-center rounded-[10px]', soon ? 'bg-[#e10600]' : 'bg-fill')}>
        <span className="text-[12px] font-extrabold leading-none tracking-wide text-white">{countryCode(race.country)}</span>
        <span className={cn('mt-[3px] text-[9px] font-semibold leading-none', soon ? 'text-white/80' : 'text-white/50')}>R{race.round}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-body block truncate">{shortRaceName(race.name)}</span>
        <span className="t-footnote mt-0.5 block truncate text-label-2">
          {showResults && race.winner && state === 'done' ? (
            <>
              <Trophy className="-mt-0.5 mr-1 inline h-3 w-3 text-ios-yellow" />
              {race.winner.driver}
            </>
          ) : (
            `${weekendDates(race, { year: false })} · ${race.locality || race.country}`
          )}
        </span>
      </span>
      {soon ? (
        <span className="shrink-0 rounded-full bg-[#e10600]/20 px-2 py-0.5 text-[11px] font-semibold text-[#ff5a52]">{state === 'live' ? 'This weekend' : 'Next'}</span>
      ) : (
        sprint && <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-white/80">Sprint</span>
      )}
      <ChevronRight className="-mr-1 h-[18px] w-[18px] shrink-0 text-label-3" strokeWidth={2.4} />
    </Link>
  )
}
