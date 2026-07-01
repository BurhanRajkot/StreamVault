import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { Search, X, Clapperboard, Tv, Loader2 } from 'lucide-react'
import { MediaMode, Media } from '@/lib/config'
import { getImageUrl, searchMedia } from '@/lib/api'
import { useDebounce } from 'use-debounce'
import Fuse from 'fuse.js'

interface DynamicSearchBarProps {
  mode: MediaMode
  onSearch: (query: string) => void
  searchQuery: string
  onClearSearch: () => void
  onMediaSelect?: (media: Media) => void
}

type SearchMode = 'movie' | 'tv'
type EnhancedMedia = Media & { altTitles?: string[]; normalizedTitle?: string }

const MAX_RESULTS = 8
const CACHE_LIMIT = 300 // per-mode ceiling so a long session can't grow unbounded

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------
// Canonical title (as it appears in a real title, lowercased) -> nicknames.
// Used to attach altTitles to fetched items so local fuzzy search can match
// "got" -> Game of Thrones, etc.
const TITLE_ALIASES: Record<string, string[]> = {
  'game of thrones': ['got'],
  'breaking bad': ['bb'],
  'stranger things': ['st'],
  'the lord of the rings': ['lotr'],
  'attack on titan': ['aot'],
  'star wars': ['sw'],
  'spider-man': ['spiderman'],
  'doctor who': ['dr who'],
}

// Used ONLY to give TMDB a better query when the *entire* input is a bare
// acronym it would otherwise choke on. Anything longer is passed through
// untouched, so we never silently drop the user's extra words
// (e.g. "avengers endgame" stays intact instead of collapsing to "Avengers").
const SERVER_QUERY_EXPANSIONS: Record<string, string> = {
  got: 'Game of Thrones',
  lotr: 'The Lord of the Rings',
  st: 'Stranger Things',
  bb: 'Breaking Bad',
  aot: 'Attack on Titan',
  sw: 'Star Wars',
}

function expandQueryForServer(raw: string): string {
  const key = raw.toLowerCase().trim()
  return SERVER_QUERY_EXPANSIONS[key] ?? raw
}

function enhanceMedia(items: Media[]): EnhancedMedia[] {
  return items.map((item) => {
    const title = item.title || item.name || ''
    const lower = title.toLowerCase()
    const altTitles: string[] = []

    for (const [canonical, aliases] of Object.entries(TITLE_ALIASES)) {
      if (lower === canonical || lower.includes(canonical)) altTitles.push(...aliases)
    }

    // Strip punctuation so "spider-man" also matches "spiderman".
    const normalizedTitle = title.replace(/[^\w\s]/gi, '')
    if (normalizedTitle && normalizedTitle !== title) altTitles.push(normalizedTitle)

    return { ...item, altTitles, normalizedTitle }
  })
}

// ---------------------------------------------------------------------------
// Fuse config + ranking
// ---------------------------------------------------------------------------
const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.7 },
    { name: 'name', weight: 0.7 },
    { name: 'altTitles', weight: 0.8 },
    { name: 'normalizedTitle', weight: 0.6 },
    { name: 'overview', weight: 0.1 },
  ],
  threshold: 0.4, // results are already query-scoped by the server, so we can be a touch tighter
  distance: 100,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  ignoreFieldNorm: true, // don't penalise longer titles
}

function popularityOf(item: Media): number {
  const p = (item as { popularity?: number }).popularity
  return typeof p === 'number' ? Math.min(p / 100, 1) : 0
}

// Blend Fuse's textual relevance with a gentle rating/popularity signal.
// Relevance dominates on purpose: we never want a "more popular" title to
// bury the exact thing someone typed.
function rankResults(fuseResults: { item: EnhancedMedia; score?: number }[]): EnhancedMedia[] {
  return [...fuseResults]
    .map(({ item, score = 1 }) => {
      const relevance = 1 - score // 1 = perfect textual match
      const rating = typeof item.vote_average === 'number' ? item.vote_average / 10 : 0
      const blended = relevance * 0.85 + rating * 0.1 + popularityOf(item) * 0.05
      return { item, blended }
    })
    .sort((a, b) => b.blended - a.blended)
    .map((r) => r.item)
}

function resolveSearchMode(mode: MediaMode): SearchMode {
  return mode === 'tv' ? 'tv' : 'movie'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DynamicSearchBar({
  mode,
  onSearch,
  searchQuery,
  onClearSearch,
  onMediaSelect,
}: DynamicSearchBarProps) {
  const [inputValue, setInputValue] = useState(searchQuery || '')
  const [debouncedQuery] = useDebounce(inputValue, 250)
  const [results, setResults] = useState<EnhancedMedia[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Session cache, scoped per search-mode so movie results never leak into a
  // TV search. Only used to paint *instant, optimistic* results while the
  // network request is in flight — the authoritative results always come from
  // the query-scoped server fetch below.
  const cacheRef = useRef<Record<SearchMode, Map<number, EnhancedMedia>>>({
    movie: new Map(),
    tv: new Map(),
  })

  const rememberMedia = useCallback((items: EnhancedMedia[], searchMode: SearchMode) => {
    const cache = cacheRef.current[searchMode]
    for (const item of items) {
      if (cache.has(item.id)) cache.delete(item.id) // refresh recency
      cache.set(item.id, item)
    }
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }, [])

  const searchCache = useCallback((query: string, searchMode: SearchMode): EnhancedMedia[] => {
    const items = Array.from(cacheRef.current[searchMode].values())
    if (items.length === 0) return []
    const fuse = new Fuse(items, FUSE_OPTIONS)
    return rankResults(fuse.search(query)).slice(0, MAX_RESULTS)
  }, [])

  // Sync input with external explicit searches / clears.
  useEffect(() => {
    setInputValue(searchQuery || '')
    if (searchQuery && searchQuery.trim().length > 0) setIsOpen(true)
  }, [searchQuery])

  // Close on outside click.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Core search. Fully cancellable: the cleanup flips `cancelled` before the
  // next run starts, so a slow in-flight request can never overwrite fresher
  // results (this was the main correctness bug in the worker version).
  useEffect(() => {
    const rawQ = debouncedQuery.trim()
    if (!rawQ) {
      setResults([])
      setIsSearching(false)
      return
    }

    let cancelled = false
    const searchMode = resolveSearchMode(mode)

    // 1. Instant, optimistic results from what we've already seen this session.
    const cached = searchCache(rawQ, searchMode)
    if (cached.length) {
      setResults(cached)
      setSelectedIndex(-1)
    }

    setIsSearching(true)

      ; (async () => {
        try {
          const data = await searchMedia(searchMode, expandQueryForServer(rawQ), 1)
          if (cancelled) return

          const enhanced = enhanceMedia(data.results || [])
          rememberMedia(enhanced, searchMode)

          // 2. Re-rank fresh, query-scoped results (adds typo/alias tolerance and
          //    a light popularity tiebreak). Server order is the fallback.
          const fuse = new Fuse(enhanced, FUSE_OPTIONS)
          const matched = fuse.search(rawQ)
          const ranked = matched.length ? rankResults(matched) : enhanced

          if (cancelled) return
          setResults(ranked.slice(0, MAX_RESULTS))
          setSelectedIndex(-1)
        } catch (err) {
          console.error('Search failed:', err)
          if (!cancelled && cached.length === 0) setResults([])
        } finally {
          if (!cancelled) setIsSearching(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, mode, searchCache, rememberMedia])

  // Keep the keyboard-highlighted option scrolled into view.
  useEffect(() => {
    if (selectedIndex < 0) return
    const active = results[selectedIndex]
    if (!active) return
    document.getElementById(`search-option-${active.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, results])

  const submitSearch = useCallback(() => {
    const q = inputValue.trim()
    if (!q) return
    setIsOpen(false)
    onSearch(q)
  }, [inputValue, onSearch])

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    submitSearch()
  }

  const handleClear = () => {
    setInputValue('')
    setResults([])
    setIsOpen(false)
    setSelectedIndex(-1)
    onClearSearch()
  }

  const handleSelect = (media: Media) => {
    setIsOpen(false)
    if (onMediaSelect) {
      onMediaSelect(media)
    } else {
      const title = media.title || media.name || ''
      setInputValue(title)
      onSearch(title)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault()
        handleSelect(results[selectedIndex])
      }
    }
  }

  return (
    <div className="relative flex w-full sm:w-auto group" ref={dropdownRef}>
      <form onSubmit={handleFormSubmit} className="relative flex w-full sm:w-auto">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-all duration-300 group-focus-within:scale-110 z-10" />
        <input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setIsOpen(true)
            setSelectedIndex(-1)
          }}
          onFocus={() => {
            if (inputValue.trim()) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${mode === 'tv' ? 'shows' : mode === 'documentary' ? 'documentaries' : 'movies'
            }...`}
          className="h-11 w-full sm:w-56 lg:w-72 rounded-lg border border-border/50 bg-secondary/60 backdrop-blur-xl pl-11 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-[background-color,color,border-color,box-shadow] duration-300 placeholder:text-muted-foreground/60 shadow-inner"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="search-listbox"
          aria-activedescendant={
            selectedIndex >= 0 && results[selectedIndex]
              ? `search-option-${results[selectedIndex].id}`
              : undefined
          }
        />
        {(inputValue || searchQuery) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:scale-110 transition-all duration-200 active:scale-90 z-10 bg-secondary/80 rounded-full p-0.5"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Dropdown */}
      {isOpen && inputValue.trim().length > 0 && (
        <div
          id="search-dropdown"
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-background/95 backdrop-blur-2xl border border-border/50 rounded-xl shadow-2xl overflow-hidden z-[100] max-h-[70vh] flex flex-col animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200"
        >
          {isSearching && results.length === 0 && (
            <div className="p-10 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium animate-pulse">Scanning the vault...</span>
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="p-10 text-center text-muted-foreground flex flex-col items-center gap-3 bg-secondary/10">
              <Search className="h-10 w-10 opacity-20" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  No matches for &quot;{inputValue}&quot;
                </p>
                <p className="text-xs opacity-75 mt-1">
                  Try checking for typos or searching by genre.
                </p>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div id="search-listbox" className="overflow-y-auto py-2 custom-scrollbar" role="listbox">
              {results.map((media, index) => {
                const title = media.title || media.name || 'Unknown'
                const year =
                  media.release_date || media.first_air_date
                    ? new Date(media.release_date || media.first_air_date!).getFullYear()
                    : ''
                const typeIcon =
                  media.media_type === 'tv' ? (
                    <Tv className="w-3.5 h-3.5" />
                  ) : (
                    <Clapperboard className="w-3.5 h-3.5" />
                  )

                return (
                  <button
                    key={media.id}
                    id={`search-option-${media.id}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    onClick={() => handleSelect(media)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-4 transition-all duration-150 ${index === selectedIndex
                      ? 'bg-primary/10 border-l-2 border-primary pl-4'
                      : 'hover:bg-accent border-l-2 border-transparent hover:pl-4'
                      }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-secondary relative shadow-sm border border-border/20">
                      <img
                        src={getImageUrl(media.poster_path, 'thumbnail')}
                        alt={title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        width={342}
                        height={513}
                        onError={(e) => {
                          const target = e.currentTarget
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent && !parent.querySelector('.img-fallback')) {
                            const fallback = document.createElement('div')
                            fallback.className =
                              'img-fallback w-full h-full flex items-center justify-center text-muted-foreground/30'
                            fallback.innerHTML =
                              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 9 5 12L16 3l2 4h4"/></svg>'
                            parent.appendChild(fallback)
                          }
                        }}
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h4 className="text-sm font-semibold truncate text-foreground/90 flex items-center gap-2">
                        {title}
                        {year && (
                          <span className="text-xs font-normal text-muted-foreground">({year})</span>
                        )}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-primary/80">
                          {typeIcon} {media.media_type || mode}
                        </span>
                        {media.vote_average && media.vote_average > 0 && (
                          <span className="flex items-center gap-1 text-golden-amber">
                            ★ {media.vote_average.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Footer */}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => submitSearch()}
              className="w-full p-3.5 text-[11px] font-bold text-center text-primary bg-primary/5 hover:bg-primary/15 border-t border-border/40 transition-colors uppercase tracking-widest"
            >
              See all results for &quot;{inputValue}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  )
}