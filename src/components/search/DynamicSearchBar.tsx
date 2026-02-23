import { useState, useEffect, useRef, FormEvent } from 'react'
import { Search, X, Clapperboard, Tv, Loader2 } from 'lucide-react'
import { MediaMode, Media } from '@/lib/config'
import { getImageUrl, searchMedia } from '@/lib/api'
import { useDebounce } from 'use-debounce'
import Fuse from 'fuse.js'
import { calculateRelevance } from '@/lib/searchAlgorithm'

interface DynamicSearchBarProps {
  mode: MediaMode
  onSearch: (query: string) => void
  searchQuery: string
  onClearSearch: () => void
  onMediaSelect?: (media: Media) => void
}

const enhanceMovies = (movies: Media[]) => {
  return movies.map(movie => {
    const altTitles: string[] = []
    const title = movie.title || movie.name || ''
    const lower = title.toLowerCase()

    // Add common aliases for robust fuzzy searching
    if (lower === "game of thrones") altTitles.push("got")
    if (lower === "breaking bad") altTitles.push("bb")
    if (lower === "stranger things") altTitles.push("st")
    if (lower === "the lord of the rings") altTitles.push("lotr")
    if (lower === "avengers") altTitles.push("marvel")
    if (lower === "attack on titan") altTitles.push("aot")
    if (lower.includes('spider-man')) altTitles.push("spiderman")
    if (lower.includes('star wars')) altTitles.push("sw")
    if (lower.includes('doctor who')) altTitles.push("dr who")

    // Normalize text (remove special characters for fuzzy matching)
    const normalizedTitle = title.replace(/[^\w\s]/gi, '')
    if (normalizedTitle !== title) {
        altTitles.push(normalizedTitle)
    }

    return { ...movie, altTitles, normalizedTitle }
  })
}

const normalizeSearchQuery = (q: string): string => {
  const lower = q.toLowerCase().trim()

  // Exact acronym mappings
  const exactMap: Record<string, string> = {
    'got': 'Game of Thrones',
    'lotr': 'The Lord of the Rings',
    'st': 'Stranger Things',
    'bb': 'Breaking Bad',
    'aot': 'Attack on Titan',
    'sw': 'Star Wars'
  }

  if (exactMap[lower]) return exactMap[lower]

  // Predictive substring / phonetic mappings
  if (/night.*seven/i.test(lower) || /knight.*seven/i.test(lower)) return 'A Knight of the Seven Kingdoms'
  if (/hum[au]n.*cent/i.test(lower)) return 'The Human Centipede'
  if (/(spider[\s-]?man|spiderman)/i.test(lower)) return 'Spider-Man'
  if (/(dr\.?\s*who|doctor\swho)/i.test(lower)) return 'Doctor Who'
  if (/avenger/i.test(lower)) return 'Avengers'
  if (/batman/i.test(lower)) return 'The Batman'
  if (/harry\s*potter/i.test(lower) || /hp/i.test(lower)) return 'Harry Potter'
  if (/witcher/i.test(lower)) return 'The Witcher'
  if (/mandalorian/i.test(lower) || /mando/i.test(lower)) return 'The Mandalorian'

  return q // Fallback to original case-preserved query to avoid lowercasing if unnecessary
}

// Global cached Fuse instance configuration
const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.7 }, // slightly lowered title weight
    { name: 'name', weight: 0.7 },
    { name: 'altTitles', weight: 0.8 }, // boosted altTitles (where normalized text lives)
    { name: 'normalizedTitle', weight: 0.6 },
    { name: 'overview', weight: 0.1 },
  ],
  threshold: 0.5, // Aggressive fuzzy search mode
  distance: 100, // Determines how close the match must be to the fuzzy location
  includeScore: true,
  ignoreLocation: true, // Don't care where the match is in the string
  minMatchCharLength: 2, // 'g' can match, but 'go' is better for fuzzy
  ignoreFieldNorm: true, // IMPORTANT: Don't penalize longer titles
}

export function DynamicSearchBar({
  mode,
  onSearch,
  searchQuery,
  onClearSearch,
  onMediaSelect
}: DynamicSearchBarProps) {
  const [inputValue, setInputValue] = useState(searchQuery || '')
  const [debouncedQuery] = useDebounce(inputValue, 250)
  const [results, setResults] = useState<Media[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // Ref to power the local fuse instance
  const cacheRef = useRef<Map<number, Media>>(new Map())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)

  // Initialize background thread web worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('@/lib/searchWorker.ts', import.meta.url), { type: 'module' })
    return () => workerRef.current?.terminate()
  }, [])

  // Sync input value with external explicit searches or clears
  useEffect(() => {
    setInputValue(searchQuery || '')
  }, [searchQuery])

  // Handle clicking outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Core Search Engine Logic
  useEffect(() => {
    let isStale = false

    const performSearch = async () => {
      const rawQ = debouncedQuery.trim()

      if (!rawQ) {
        setResults([])
        setIsSearching(false)
        return
      }

      const q = normalizeSearchQuery(rawQ) // Intelligent contextual mapping

      setIsSearching(true)

      try {
        // 1. Fetch live TMDB results to ensure we have fresh data for the query
        const searchMode = (mode === 'documentary' || mode === 'home') ? 'movie' : mode
        const tmdbData = await searchMedia(searchMode, q, 1) // Fetch first page

        if (isStale) return

        // 2. Enhance TMDB data with our custom aliases
        const newMedia = enhanceMovies(tmdbData.results || [])

        // 3. Update our global cache (acting like Netflix's memory)
        newMedia.forEach(m => cacheRef.current.set(m.id, m))

        // 4. Create local Fuse instance on ALL downloaded data so far
        const allCachedMedia = Array.from(cacheRef.current.values())
        const fuse = new Fuse(allCachedMedia, FUSE_OPTIONS)

        // 5. Perform the ultimate fuzzy search over aggregated data
        const fuzzyResults = fuse.search(q)

        if (isStale) return

        // 6. Apply Advanced Mathematical Hybrid Scoring via Web Worker
        // This guarantees O(N*M) calculation doesn't drop framedrops in UI
        if (workerRef.current) {
          workerRef.current.onmessage = (e) => {
             if (isStale) return
             setResults(e.data)
             setIsSearching(false)
          }
          // Offload to background thread
          workerRef.current.postMessage({ query: q, fuzzyResults, newMedia: newMedia.map(m => ({ ...m })) })
        } else {
          // Fallback if worker fails for some reason
          setResults(fuzzyResults.map(r => r.item).slice(0, 8) as Media[])
          setIsSearching(false)
        }

      } catch (e) {
        console.error("Fuzzy search error:", e)
        if (!isStale) {
          setResults([])
          setIsSearching(false)
        }
      }
      // Removed finally { setIsSearching(false) } because the Worker is asynchronous
      // and controls the loading state completion inside onmessage.
    }

    performSearch()

    return () => {
      isStale = true
    }
  }, [debouncedQuery, mode])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      setIsOpen(false)
      onSearch(inputValue.trim())
    }
  }

  const handleClear = () => {
    setInputValue('')
    setResults([])
    setIsOpen(false)
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
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault()
        handleSelect(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // To highlight matches if needed (Fuse.js returns matches if includeMatches: true is used)
  // For now, simple text is fine as it avoids innerHTML injection risks

  return (
    <div className="relative flex w-full sm:w-auto group" ref={dropdownRef}>
      <form onSubmit={handleSubmit} className="relative flex w-full sm:w-auto">
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
          placeholder={`Search ${
            mode === 'tv'
              ? 'shows'
              : mode === 'documentary'
              ? 'documentaries'
              : 'movies'
          }...`}
          className="h-9 w-full sm:w-56 lg:w-72 rounded-lg border border-border/50 bg-secondary/60 backdrop-blur-xl pl-11 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/60 shadow-inner"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="search-dropdown"
          aria-activedescendant={selectedIndex >= 0 && results[selectedIndex] ? `search-option-${results[selectedIndex].id}` : undefined}
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

      {/* Dropdown Results Window */}
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
                 <p className="text-sm font-medium text-foreground">No matches for &quot;{inputValue}&quot;</p>
                 <p className="text-xs opacity-75 mt-1">Try checking for typos or searching by genre.</p>
              </div>
            </div>
          )}

          {results.length > 0 && (
             <div className="overflow-y-auto py-2 custom-scrollbar" role="listbox">
               {results.map((media, index) => {
                 const title = media.title || media.name || 'Unknown'
                 const year = media.release_date || media.first_air_date
                    ? new Date(media.release_date || media.first_air_date!).getFullYear()
                    : ''
                 const typeIcon = media.media_type === 'tv' ? <Tv className="w-3.5 h-3.5" /> : <Clapperboard className="w-3.5 h-3.5" />

                 return (
                   <button
                     key={media.id}
                     id={`search-option-${media.id}`}
                     role="option"
                     aria-selected={index === selectedIndex}
                     onClick={() => handleSelect(media)}
                     onMouseEnter={() => setSelectedIndex(index)}
                     className={`w-full text-left px-3 py-2.5 flex items-center gap-4 transition-all duration-150 ${
                       index === selectedIndex
                        ? 'bg-primary/10 border-l-2 border-primary pl-4'
                        : 'hover:bg-accent border-l-2 border-transparent hover:pl-4'
                     }`}
                   >
                     {/* Media Thumbnail */}
                     <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-secondary relative shadow-sm border border-border/20">
                       <img
                          src={getImageUrl(media.poster_path, 'thumbnail')}
                          alt={title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                       />
                     </div>

                     {/* Media Details */}
                     <div className="flex-1 min-w-0 flex flex-col justify-center">
                       <h4 className="text-sm font-semibold truncate text-foreground/90 flex items-center gap-2">
                         {title}
                         {year && <span className="text-xs font-normal text-muted-foreground">({year})</span>}
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

          {/* Footer Action */}
          {results.length > 0 && (
             <button
                onClick={handleSubmit}
                className="w-full p-3.5 text-[11px] font-bold text-center text-primary bg-primary/5 hover:bg-primary/15 border-t border-border/40 transition-colors uppercase tracking-widest"
             >
                See all results for "{inputValue}"
             </button>
          )}
        </div>
      )}
    </div>
  )
}
