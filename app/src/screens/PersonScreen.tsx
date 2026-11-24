import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EASE_OUT } from '@app/lib/motion'
import { fetchPerson, filmography } from '@app/lib/extras'
import { FadeImg, PosterGrid, PosterGridSkeleton, PosterRow, tmdbImg } from '@app/components/media'
import { NavBar, SegmentedControl } from '@app/components/kit'

type Shelf = 'movie' | 'tv'

const DEPARTMENT: Record<string, string> = {
  Acting: 'Actor',
  Directing: 'Director',
  Writing: 'Writer',
  Production: 'Producer',
  Sound: 'Composer',
  Camera: 'Cinematographer',
  Editing: 'Editor',
  Creator: 'Creator',
}

function formatDate(date: string | null): string | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

function ageOn(birthday: string, until: string | null): number | null {
  const born = new Date(`${birthday}T00:00:00`)
  const end = until ? new Date(`${until}T00:00:00`) : new Date()
  if (Number.isNaN(born.getTime())) return null
  let age = end.getFullYear() - born.getFullYear()
  if (end < new Date(end.getFullYear(), born.getMonth(), born.getDate())) age--
  return age
}

/** A person: who they are, what they're known for, and everything they've made — each title opening its page. */
export function PersonScreen() {
  const id = Number(useParams().id)
  const { data: person, isLoading } = useQuery({
    queryKey: ['app-person', id],
    queryFn: () => fetchPerson(id),
    enabled: id > 0,
    staleTime: 6 * 60 * 60 * 1000,
  })
  const works = useMemo(() => (person ? filmography(person) : null), [person])
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [bioOpen, setBioOpen] = useState(false)

  if (isLoading || !person || !works) {
    return (
      <div className="px-4 pb-tabbar pt-page lg:px-12">
        <NavBar title="" back />
        <div className="mb-8 flex flex-col items-center gap-4 lg:flex-row lg:items-end lg:gap-8">
          <div className="skeleton h-36 w-36 rounded-full lg:h-56 lg:w-40 lg:rounded-[16px]" />
          <div className="w-full max-w-md space-y-3">
            <div className="skeleton mx-auto h-8 w-2/3 rounded lg:mx-0" />
            <div className="skeleton mx-auto h-4 w-1/2 rounded lg:mx-0" />
          </div>
        </div>
        {!isLoading && !person ? <p className="t-body text-label-2">This page couldn’t load. Check your connection and try again.</p> : <PosterGridSkeleton count={12} />}
      </div>
    )
  }

  const role = DEPARTMENT[person.known_for_department] ?? person.known_for_department
  const born = formatDate(person.birthday)
  const age = person.birthday ? ageOn(person.birthday, person.deathday) : null
  const facts = [
    role,
    born && `Born ${born}${!person.deathday && age !== null ? ` (age ${age})` : ''}`,
    person.place_of_birth,
    person.deathday && `Died ${formatDate(person.deathday)}${age !== null ? ` (aged ${age})` : ''}`,
  ].filter(Boolean)
  const shelves = [
    ...(works.movies.length ? [{ id: 'movie' as const, label: `Films · ${works.movies.length}` }] : []),
    ...(works.shows.length ? [{ id: 'tv' as const, label: `Shows · ${works.shows.length}` }] : []),
  ]
  const shownShelf = shelf && shelves.some((s) => s.id === shelf) ? shelf : shelves[0]?.id
  const shelfItems = shownShelf === 'tv' ? works.shows : works.movies
  const bio = person.biography.trim()

  return (
    <div className="pb-tabbar pt-page">
      <NavBar title={person.name} back />

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="mb-8 flex flex-col items-center gap-5 px-4 text-center lg:mb-12 lg:flex-row lg:items-end lg:gap-10 lg:px-12 lg:text-left"
      >
        <div className="skeleton relative h-36 w-36 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 lg:h-[16.5rem] lg:w-44 lg:rounded-[18px]">
          {person.profile_path ? (
            <FadeImg src={tmdbImg(person.profile_path, 'w342')} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-fill text-white/40">
              <User className="h-12 w-12" />
            </span>
          )}
        </div>
        <div className="min-w-0 max-w-3xl">
          <h1 className="t-large lg:text-[clamp(2.25rem,3.6vw,3.5rem)] lg:leading-[1.05] lg:tracking-[-0.02em]">{person.name}</h1>
          <p className="t-subhead mt-2 text-label-2 lg:text-[16px]">{facts.join(' · ')}</p>
          {bio && (
            <button
              type="button"
              onClick={() => setBioOpen((v) => !v)}
              className={cn('t-subhead mt-4 block text-left text-white/80 lg:text-[16px] lg:leading-[1.55]', !bioOpen && 'line-clamp-4 lg:line-clamp-3')}
              aria-expanded={bioOpen}
            >
              {bio}
            </button>
          )}
        </div>
      </motion.header>

      {works.knownFor.length >= 4 && <PosterRow title="Known For" items={works.knownFor} />}

      {shelves.length > 0 && (
        <section className="px-4 lg:px-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[20px] font-bold leading-[25px] tracking-[-0.012em] lg:text-[22px]">Filmography</h2>
            {shelves.length > 1 && (
              <SegmentedControl<Shelf> size="sm" layoutId="person-shelf" value={shownShelf ?? 'movie'} onChange={setShelf} options={shelves} className="w-full sm:w-auto" />
            )}
          </div>
          <PosterGrid key={shownShelf} items={shelfItems} kind={shownShelf} />
        </section>
      )}
    </div>
  )
}
