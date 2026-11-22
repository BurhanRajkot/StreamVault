import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronRight, Eye, EyeOff, Flag, Play, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import {
  FIRST_F1_SEASON,
  countryCode,
  defaultSeasonYear,
  f1SeasonQuery,
  formatF1Date,
  isUpcoming,
  latestRace,
  nextRace,
  seasonYears,
  type F1Race,
} from '@/lib/f1'
import { spring } from '@app/lib/motion'
import { Button, CircleButton, EmptyState, LargeTitle, NavBar } from '@app/components/kit'
import { Sheet } from '@app/components/Sheet'

/** Seasons offered as chips; the rest are a tap on "Earlier" away. */
const RECENT_SEASONS = 6

/**
 * The F1 archive: one season — its latest race up top, ready to play, then
 * every race weekend as a list. A race opens its sessions.
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
  // The two halves of the season side by side on a wide screen
  const half = Math.ceil(races.length / 2)

  const resultsButton = (
    <CircleButton label={showResults ? 'Hide results' : 'Show results'} onClick={() => setShowResults(!showResults)}>
      {showResults ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
    </CircleButton>
  )

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <NavBar title={`F1 ${year}`} actions={resultsButton} />
      <LargeTitle
        title="Formula 1"
        subtitle={`${year} season${races.length ? ` · ${races.length} races` : ''}`}
        actions={<span className="hidden lg:block">{resultsButton}</span>}
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
          <div className="mb-6 h-[220px] animate-pulse rounded-[22px] bg-fill lg:h-[260px]" />
          <div className="glass-card h-[420px] animate-pulse rounded-[16px]" />
        </div>
      ) : races.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Not out yet" text={`The ${year} calendar hasn't been published yet.`} />
      ) : (
        <>
          {latest && <LatestRace year={year} race={latest} next={next} showResults={showResults} />}

          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            <RaceList year={year} races={races.slice(0, half)} showResults={showResults} header="Races" />
            <RaceList year={year} races={races.slice(half)} showResults={showResults} header={<span className="lg:invisible">More races</span>} />
          </div>
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

/** The latest race, big, with its race and qualifying a tap away. */
function LatestRace({ year, race, next, showResults }: { year: number; race: F1Race; next: F1Race | null; showResults: boolean }) {
  const navigate = useNavigate()
  const { premium, loading } = usePremiumAccess()
  const racePath = `/f1/${year}/${race.round}`
  const watch = (session: string) => navigate(premium || loading ? `/watch/f1/${year}/${race.round}/${session}` : racePath)
  const hasQualifying = race.sessions.some((s) => s.key === 'qualifying')

  return (
    <section aria-label="Latest race" className="relative mb-7 overflow-hidden rounded-[22px] bg-[#15151a]">
      {/* Racing red, fading into the card */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(225,6,0,0.55)_0%,rgba(225,6,0,0.12)_45%,transparent_70%)]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-6 select-none text-[150px] font-black leading-none tracking-tighter text-white/[0.06] lg:text-[200px]"
      >
        {countryCode(race.country)}
      </span>

      <div className="relative p-5 lg:p-8">
        <p className="t-caption font-semibold uppercase tracking-[0.14em] text-white/70">
          {next ? 'Latest race' : 'Season finale'} · Round {race.round}
        </p>
        <h2 className="mt-1.5 text-[28px] font-bold leading-[1.1] tracking-tight text-white lg:text-[40px]">{race.name}</h2>
        <p className="t-subhead mt-1.5 text-white/70">
          {formatF1Date(race.date)} · {[race.locality, race.country].filter(Boolean).join(', ')}
        </p>
        {showResults && race.winner && (
          <p className="t-subhead mt-2 flex items-center gap-1.5 text-white/90">
            <Trophy className="h-4 w-4 text-ios-yellow" /> {race.winner.driver}
            {race.winner.team && <span className="text-white/55">· {race.winner.team}</span>}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button onClick={() => watch('race')}>
            <Play className="fill-current" /> Race
          </Button>
          {hasQualifying && (
            <Button variant="glass" onClick={() => watch('qualifying')}>
              <Play className="fill-current" /> Qualifying
            </Button>
          )}
          <Button variant="glass" onClick={() => navigate(racePath)}>
            All sessions <ChevronRight />
          </Button>
        </div>

        {next && (
          <p className="t-footnote mt-5 text-white/55">
            Next: <span className="text-white/85">{next.name}</span> · {formatF1Date(next.date, { year: false })}
          </p>
        )}
      </div>
    </section>
  )
}

/** Race weekends as a grouped list: country code, name, date and place. */
function RaceList({ year, races, showResults, header }: { year: number; races: F1Race[]; showResults: boolean; header: React.ReactNode }) {
  if (races.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="t-footnote mb-1.5 px-4 uppercase tracking-[0.02em] text-label-2">{header}</h2>
      <ul className="glass-card overflow-hidden rounded-[16px]">
        {races.map((race) => (
          <li key={race.round}>
            <RaceRow year={year} race={race} showResults={showResults} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RaceRow({ year, race, showResults }: { year: number; race: F1Race; showResults: boolean }) {
  const upcoming = isUpcoming({ date: race.date, time: race.time })
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  return (
    <Link
      to={`/f1/${year}/${race.round}`}
      className={cn('cell-sep-inset tap relative flex min-h-[62px] items-center gap-3 px-4 py-2.5', upcoming && 'opacity-55')}
      style={{ '--sep-inset': '68px' } as React.CSSProperties}
    >
      <span className="flex h-[38px] w-[40px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-fill">
        <span className="text-[12px] font-extrabold leading-none tracking-wide text-white">{countryCode(race.country)}</span>
        <span className="mt-[3px] text-[9px] font-semibold leading-none text-white/50">R{race.round}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-body block truncate">{race.name.replace(/ Grand Prix\b/, ' GP')}</span>
        <span className="t-footnote mt-0.5 block truncate text-label-2">
          {showResults && race.winner && !upcoming ? (
            <>
              <Trophy className="-mt-0.5 mr-1 inline h-3 w-3 text-ios-yellow" />
              {race.winner.driver}
            </>
          ) : (
            `${formatF1Date(race.date, { year: false })} · ${race.locality || race.country}`
          )}
        </span>
      </span>
      {upcoming ? (
        <span className="shrink-0 rounded-full bg-tint/20 px-2 py-0.5 text-[11px] font-semibold text-tint">Upcoming</span>
      ) : (
        sprint && <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-white/80">Sprint</span>
      )}
      <ChevronRight className="-mr-1 h-[18px] w-[18px] shrink-0 text-label-3" strokeWidth={2.4} />
    </Link>
  )
}
