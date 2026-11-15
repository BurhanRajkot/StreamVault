import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Search, X } from 'lucide-react'
import { fetchTrending, searchMedia } from '@/lib/api'
import { PosterGrid, PosterGridSkeleton, kindOf, titleOf, titlePath, tmdbImg } from '@app/components/media'

/** Search with the website's hybrid search; trending titles before you type. */
export function SearchScreen() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim())
      setParams(query.trim() ? { q: query.trim() } : {}, { replace: true })
    }, 300)
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

  return (
    <div className="mx-auto max-w-6xl pb-tabbar lg:pb-10">
      <div className="sticky top-0 z-20 bg-[#0a0a0c]/95 px-4 pb-3 pt-safe backdrop-blur-xl lg:px-8">
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.08] px-3 lg:mt-8">
          <Search className="h-[18px] w-[18px] shrink-0 text-white/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, anime…"
            className="h-11 min-w-0 flex-1 bg-transparent text-[14.5px] text-white outline-none placeholder:text-white/40"
            enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
          />
          {query && (
            <button aria-label="Clear" onClick={() => setQuery('')} className="p-1 text-white/50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-8">
        {debounced.length >= 2 ? (
          isFetching && !results ? (
            <PosterGridSkeleton count={12} />
          ) : results && results.length > 0 ? (
            <>
              <h2 className="mb-2.5 text-[14px] font-bold text-white/85">Results</h2>
              <PosterGrid items={results} />
            </>
          ) : (
            <p className="pt-16 text-center text-[13.5px] text-white/50">Nothing found for “{debounced}”.</p>
          )
        ) : (
          <>
            <h2 className="mb-2 mt-1 text-[16px] font-bold">Top Searches</h2>
            <ul className="flex flex-col gap-1">
              {(trending ?? []).filter((m) => m.backdrop_path).slice(0, 12).map((m) => (
                <li key={`${m.media_type}-${m.id}`}>
                  <Link to={titlePath(m)} className="press flex items-center gap-3 rounded-md bg-white/[0.03] pr-3">
                    <img src={tmdbImg(m.backdrop_path, 'w300')} alt="" loading="lazy" className="aspect-video w-[132px] rounded-l-md object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13.5px] font-semibold">{titleOf(m)}</span>
                      <span className="text-[11px] text-white/45">{kindOf(m) === 'tv' ? 'Series' : 'Movie'}</span>
                    </span>
                    <Play className="h-6 w-6 shrink-0 rounded-full border border-white/60 p-1 text-white" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
