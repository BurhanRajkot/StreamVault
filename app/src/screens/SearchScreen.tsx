import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { fetchTrending, searchMedia, type SearchEntity } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FadeImg, PosterGrid, PosterGridSkeleton, TitleLink, kindOf, titleOf, tmdbImg, yearOf } from '@app/components/media'
import { EmptyState, NavBar, SegmentedControl } from '@app/components/kit'

/** Each one is answered by what it names: a director's films, a studio's, a topic's. */
const QUICK = ['Christopher Nolan', 'Korean drama', 'Bollywood', 'Studio Ghibli', 'Marvel', 'True crime', 'Shah Rukh Khan', 'Time travel', 'Pixar', 'Star Wars']

type KindFilter = 'all' | 'movie' | 'tv'

/** Search with the website's hybrid search; trending titles before you type. */
export function SearchScreen() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // A wide window arrives here from the top bar's search (or Ctrl K): type straight away
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim())
      setParams(query.trim() ? { q: query.trim() } : {}, { replace: true })
    }, 280)
    return () => clearTimeout(timer)
  }, [query, setParams])

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  // Two pages at most — a search is answered, not scrolled forever. The first
  // shows the moment it arrives; the second fills in under it, so a search
  // never waits on two round trips before showing anything.
  const { data: first, isFetching } = useQuery({
    queryKey: ['app-search', debounced, 1],
    queryFn: ({ signal }) => searchMedia('home', debounced, 1, signal),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60 * 1000,
  })
  const { data: second } = useQuery({
    queryKey: ['app-search', debounced, 2],
    queryFn: ({ signal }) => searchMedia('home', debounced, 2, signal),
    // A person's or studio's search is answered by its own titles on the first page
    enabled: !!first?.hasMore && !first.entity && first.results.length < 30,
    staleTime: 5 * 60 * 1000,
  })
  const answer = useMemo(() => {
    if (!first) return undefined
    if (!second?.results.length) return { results: first.results, entity: first.entity ?? null }
    const seen = new Set(first.results.map((m) => `${m.media_type}:${m.id}`))
    return { results: [...first.results, ...second.results.filter((m) => !seen.has(`${m.media_type}:${m.id}`))], entity: first.entity ?? null }
  }, [first, second])
  const results = answer?.results
  // A new search starts on "All"
  useEffect(() => setKindFilter('all'), [debounced])
  const counts = useMemo(() => {
    const movie = (results ?? []).filter((m) => kindOf(m) === 'movie').length
    return { movie, tv: (results ?? []).length - movie }
  }, [results])
  const shown = useMemo(
    () => (kindFilter === 'all' ? results ?? [] : (results ?? []).filter((m) => kindOf(m) === kindFilter)),
    [results, kindFilter]
  )
  const { data: trending } = useQuery({ queryKey: ['app-row', 'home', 'top'], queryFn: () => fetchTrending('home'), staleTime: 30 * 60 * 1000 })
  const searching = debounced.length >= 2

  return (
    <div className="pb-tabbar pt-page">
      <NavBar title="Search" />
      <div className="px-4 lg:mx-auto lg:max-w-3xl lg:px-12">
        <h1 className="t-large mb-3 lg:mb-6 lg:text-center lg:text-[40px] lg:leading-[48px]">Search</h1>
        <div className="flex h-11 items-center gap-2 rounded-full bg-fill px-3.5 lg:h-12 lg:px-5">
          {isFetching ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-label-2" /> : <Search className="h-[18px] w-[18px] shrink-0 text-label-2" strokeWidth={2.2} />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Movies, shows, anime, people"
            className="t-body h-full min-w-0 flex-1 bg-transparent text-white caret-tint outline-none placeholder:text-label-2 lg:text-[18px]"
            enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') inputRef.current?.blur()
              if (e.key === 'Escape') setQuery('')
            }}
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
                aria-label="Clear"
                onClick={() => setQuery('')}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-label-2 text-black"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {!searching && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:mt-4 lg:flex-wrap lg:justify-center lg:px-0">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => setQuery(q)} className="press h-8 shrink-0 rounded-full bg-fill px-3.5 text-[14px] font-medium text-white/85">
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 px-4 lg:mt-10 lg:px-12">
        {searching ? (
          isFetching && !results ? (
            <PosterGridSkeleton count={14} />
          ) : results && results.length > 0 ? (
            <>
              {answer?.entity && <EntityHeader entity={answer.entity} />}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="t-footnote text-label-2">
                  {shown.length} result{shown.length === 1 ? '' : 's'} for <span className="text-white">“{debounced}”</span>
                </p>
                {counts.movie > 0 && counts.tv > 0 && (
                  <SegmentedControl<KindFilter>
                    size="sm"
                    layoutId="search-kind"
                    value={kindFilter}
                    onChange={setKindFilter}
                    className="w-full sm:w-auto"
                    options={[
                      { id: 'all', label: 'All' },
                      { id: 'movie', label: `Movies · ${counts.movie}` },
                      { id: 'tv', label: `Shows · ${counts.tv}` },
                    ]}
                  />
                )}
              </div>
              <PosterGrid key={`${debounced}-${kindFilter}`} items={shown} />
            </>
          ) : (
            <EmptyState icon={<Search />} title={`No results for “${debounced}”`} text="Check the spelling, or try a person's name." />
          )
        ) : (
          <div className="lg:mx-auto lg:max-w-3xl">
            <h2 className="mb-2 text-[20px] font-bold leading-[25px] tracking-[-0.012em] lg:text-[22px]">Top Searches</h2>
            <ul className="lg:grid lg:grid-cols-2 lg:gap-x-6">
              {(trending ?? [])
                .filter((m) => m.backdrop_path)
                .slice(0, 12)
                .map((m) => (
                  <li key={`${m.media_type}-${m.id}`}>
                    <TitleLink item={m} className="group press flex items-center gap-3 border-b-[length:var(--hairline)] border-separator py-2.5">
                      <span className="skeleton relative w-[112px] shrink-0 overflow-hidden rounded-[6px]">
                        <FadeImg src={tmdbImg(m.backdrop_path, 'w300')} loading="lazy" className="aspect-video w-full object-cover" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-subhead line-clamp-2 font-semibold">{titleOf(m)}</span>
                        <span className="t-footnote block text-label-2">
                          {kindOf(m) === 'tv' ? 'Series' : 'Film'}
                          {yearOf(m) ? ` · ${yearOf(m)}` : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-label-3" strokeWidth={2.4} />
                    </TitleLink>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

const ENTITY_LINE: Record<SearchEntity['kind'], (e: SearchEntity) => string> = {
  person: (e) => (e.role === 'Actor' ? 'Best-known roles' : `Films and shows · ${e.role}`),
  company: () => 'Studio · its films and shows',
  collection: () => 'The whole franchise, in order',
  keyword: () => 'Films and shows about it',
}

/** Who or what the search named, above that entity's titles. */
function EntityHeader({ entity }: { entity: SearchEntity }) {
  const isPerson = entity.kind === 'person'
  return (
    <div className="mb-4 flex items-center gap-3.5 glass-card rounded-[16px] p-3 lg:mb-6 lg:p-4">
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden',
          isPerson ? 'h-14 w-14 rounded-full bg-fill' : entity.kind === 'company' ? 'h-14 w-14 rounded-[12px] bg-white/90 p-2' : 'h-14 w-14 rounded-[12px] bg-fill',
        )}
      >
        {entity.imagePath ? (
          <FadeImg src={tmdbImg(entity.imagePath, 'w185')} alt="" className={cn('h-full w-full', entity.kind === 'company' ? 'object-contain' : 'object-cover')} />
        ) : (
          <Search className="h-6 w-6 text-label-2" />
        )}
      </span>
      <span className="min-w-0">
        <span className="t-headline block truncate">{entity.name}</span>
        <span className="t-footnote block text-label-2">{ENTITY_LINE[entity.kind](entity)}</span>
      </span>
    </div>
  )
}
