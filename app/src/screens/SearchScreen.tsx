import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Play, Search, X } from 'lucide-react'
import { fetchTrending, searchMedia } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EASE_OUT, item, stagger } from '@app/lib/motion'
import { FadeImg, PosterGrid, PosterGridSkeleton, kindOf, titleOf, titlePath, tmdbImg, yearOf } from '@app/components/media'

const QUICK = ['Marvel', 'Christopher Nolan', 'Korean drama', 'Studio Ghibli', 'Bollywood', 'True crime', 'Star Wars', 'Pixar']

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

  const { data: results, isFetching } = useQuery({
    queryKey: ['app-search', debounced],
    queryFn: async ({ signal }) => {
      // Two pages at most — a search is answered, not scrolled forever
      const first = await searchMedia('home', debounced, 1, signal)
      if (!first.hasMore || first.results.length >= 30) return first.results
      const second = await searchMedia('home', debounced, 2, signal)
      const seen = new Set(first.results.map((m) => `${m.media_type}:${m.id}`))
      return [...first.results, ...second.results.filter((m) => !seen.has(`${m.media_type}:${m.id}`))]
    },
    enabled: debounced.length >= 2,
    staleTime: 5 * 60 * 1000,
  })
  const { data: trending } = useQuery({ queryKey: ['app-row', 'home', 'top'], queryFn: () => fetchTrending('home'), staleTime: 30 * 60 * 1000 })
  const searching = debounced.length >= 2

  return (
    <div className="pb-tabbar lg:pt-[calc(var(--topbar-h)+28px)]">
      <div className="sticky top-0 z-20 px-4 pb-4 pt-[calc(var(--sat)+10px)] lg:static lg:mx-auto lg:max-w-3xl lg:px-12 lg:pb-8 lg:pt-4">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/95 to-transparent lg:hidden" />
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="font-display mb-4 hidden text-center text-[44px] font-extrabold tracking-tight lg:block"
        >
          Search
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.05 }}
          className="glass group flex items-center gap-3 rounded-2xl px-4 transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_hsl(var(--primary))] lg:rounded-full lg:px-6"
        >
          {isFetching ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <Search className="h-5 w-5 shrink-0 text-white/50 group-focus-within:text-white" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Movies, shows, anime, people…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] font-medium text-white outline-none placeholder:text-white/35 lg:h-16 lg:text-[19px]"
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
              <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} aria-label="Clear" onClick={() => setQuery('')} className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20">
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
        {!searching && (
          <motion.div variants={stagger(0.03, 0.15)} initial="hidden" animate="show" className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:mt-5 lg:flex-wrap lg:justify-center lg:px-0">
            {QUICK.map((q) => (
              <motion.button
                key={q}
                variants={item}
                onClick={() => setQuery(q)}
                className="press shrink-0 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-semibold text-white/70 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.12] hover:text-white"
              >
                {q}
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      <div className="px-4 lg:px-12">
        {searching ? (
          isFetching && !results ? (
            <PosterGridSkeleton count={14} />
          ) : results && results.length > 0 ? (
            <>
              <p className="mb-3 text-[13px] font-semibold text-white/50">
                {results.length} result{results.length === 1 ? '' : 's'} for <span className="text-white">“{debounced}”</span>
              </p>
              <PosterGrid key={debounced} items={results} />
            </>
          ) : (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 text-center text-[14px] text-white/50">
              Nothing found for “{debounced}”. Try another spelling or a person&apos;s name.
            </motion.p>
          )
        ) : (
          <>
            <h2 className="font-display mb-3 text-[18px] font-extrabold lg:text-[22px]">Top searches</h2>
            <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 lg:gap-3">
              {(trending ?? [])
                .filter((m) => m.backdrop_path)
                .slice(0, 12)
                .map((m, i) => (
                  <motion.li key={`${m.media_type}-${m.id}`} variants={item}>
                    <Link
                      to={titlePath(m)}
                      className="group press flex items-center gap-3 overflow-hidden rounded-2xl bg-white/[0.035] pr-3 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.07]"
                    >
                      <span className="skeleton relative w-[136px] shrink-0 overflow-hidden lg:w-[160px]">
                        <FadeImg src={tmdbImg(m.backdrop_path, 'w300')} loading="lazy" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <span className="font-display absolute bottom-1 left-2 text-[22px] font-extrabold text-white/90 drop-shadow">{i + 1}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13.5px] font-bold">{titleOf(m)}</span>
                        <span className="text-[11.5px] text-white/45">
                          {kindOf(m) === 'tv' ? 'Series' : 'Film'}
                          {yearOf(m) ? ` · ${yearOf(m)}` : ''}
                        </span>
                      </span>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-white/30 transition-all group-hover:scale-110 group-hover:bg-white group-hover:text-black')}>
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      </span>
                    </Link>
                  </motion.li>
                ))}
            </motion.ul>
          </>
        )}
      </div>
    </div>
  )
}
