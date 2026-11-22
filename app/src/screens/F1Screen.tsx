import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, Eye, EyeOff, Flag, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useF1ShowResults } from '@/hooks/useF1ShowResults'
import { FIRST_F1_SEASON, defaultSeasonYear, f1SeasonQuery, formatF1Date, isUpcoming, seasonYears, type F1Race } from '@/lib/f1'
import { spring } from '@app/lib/motion'
import { CategoryHeader } from '@app/components/CategoryHeader'
import { Button, EmptyState } from '@app/components/kit'
import { Sheet } from '@app/components/Sheet'

/** Seasons offered as chips; the rest are a tap on "Earlier" away. */
const RECENT_SEASONS = 6

/**
 * The F1 archive: one season's race weekends. A race opens its sessions —
 * practice, qualifying, sprints, the race — to watch on Premium or download.
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

  return (
    <div className="px-4 pb-tabbar pt-[calc(var(--sat)+100px)] lg:px-12 lg:pt-[calc(var(--topbar-h)+32px)]">
      <CategoryHeader active="f1" overHero={false} />

      <header className="mb-5 flex flex-wrap items-end gap-3 lg:mb-7">
        <div className="min-w-0 flex-1">
          <p className="t-footnote flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-ios-red">
            <Flag className="h-3.5 w-3.5" /> Formula 1
          </p>
          <h1 className="t-large mt-0.5 lg:text-[40px] lg:leading-[48px]">{year} Season</h1>
          <p className="t-subhead mt-1 text-label-2">
            {races.length > 0 ? `${races.length} race weekends · ` : ''}practice, qualifying, sprints and races
          </p>
        </div>
        <Button variant="glass" size="sm" onClick={() => setShowResults(!showResults)} aria-pressed={showResults}>
          {showResults ? <Eye /> : <EyeOff />}
          {showResults ? 'Results shown' : 'Results hidden'}
        </Button>
      </header>

      <nav aria-label="Seasons" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
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
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="glass-card h-[92px] animate-pulse rounded-[16px]" />
          ))}
        </div>
      ) : races.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Not out yet" text={`The ${year} calendar hasn't been published yet.`} />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {races.map((race) => (
            <li key={race.round}>
              <RaceCard year={year} race={race} showResults={showResults} />
            </li>
          ))}
        </ul>
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

function RaceCard({ year, race, showResults }: { year: number; race: F1Race; showResults: boolean }) {
  const upcoming = isUpcoming({ date: race.date, time: race.time })
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  return (
    <Link to={`/f1/${year}/${race.round}`} className="glass-card tap flex h-full items-start gap-3.5 rounded-[16px] p-4">
      <span className="w-9 shrink-0 text-right text-[26px] font-bold leading-[30px] tracking-tight text-white/90 tabular-nums">{race.round}</span>
      <span className="min-w-0 flex-1">
        <span className="t-headline block truncate">{race.name}</span>
        <span className="t-footnote mt-0.5 block truncate text-label-2">
          {formatF1Date(race.date)} · {[race.locality, race.country].filter(Boolean).join(', ')}
        </span>
        {(upcoming || sprint || (showResults && race.winner && !upcoming)) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {upcoming && <span className="rounded-full bg-tint/20 px-2 py-0.5 text-[11px] font-semibold text-tint">Upcoming</span>}
            {sprint && <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-white/85">Sprint</span>}
            {showResults && race.winner && !upcoming && (
              <span className="t-caption flex min-w-0 items-center gap-1 text-label-2">
                <Trophy className="h-3 w-3 shrink-0 text-ios-yellow" />
                <span className="truncate text-white/90">{race.winner.driver}</span>
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  )
}
