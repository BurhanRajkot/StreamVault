// ============================================================
// CineMatch — Local Rule-Based NLU Query Parser
//
// Parses natural language search queries like:
//   "2000 action movie"  → genres=[28], year_range=2000-2009, mediaType=movie
//   "scary 90s sci-fi"   → genres=[27,878], year_range=1990-1999
//   "crime tv shows"     → genres=[80], mediaType=tv
//   "inception"          → isConversational=false (falls through to title search)
//
// Zero external API calls — pure TypeScript regex + static lookup tables.
// Works offline, instant latency, no API key required.
// ============================================================

export interface ParsedQuery {
  isConversational: boolean
  remainingQuery?: string
  mediaType?: 'movie' | 'tv'
  filters: {
    with_genres?: string
    'primary_release_date.gte'?: string
    'primary_release_date.lte'?: string
    'first_air_date.gte'?: string
    'first_air_date.lte'?: string
    with_text_query?: string
    sort_by?: string
    'vote_average.gte'?: string
  }
}

// ── Genre keyword → TMDB genre ID map ─────────────────────────────────────
// Each entry is [pattern, genreId]. Patterns are checked case-insensitively.
// Order matters: more specific patterns first.
const GENRE_MAP: Array<[RegExp, number]> = [
  [/\bsci[- ]?fi\b|\bscience.?fiction\b/i,  878],
  [/\baction\b/i,                             28],
  [/\badventure\b/i,                          12],
  [/\banimation\b|\banimated\b|\bcartoon\b/i, 16],
  [/\bcomedy\b|\bfunny\b|\bhilarious\b/i,    35],
  [/\bcrime\b|\bheist\b/i,                   80],
  [/\bdocumentar/i,                           99],
  [/\bdrama\b/i,                              18],
  [/\bfamilies\b|\bfamily\b|\bkids\b|\bchildren\b/i, 10751],
  [/\bfantas/i,                              14],
  [/\bhistor/i,                              36],
  [/\bhorror\b|\bscary\b|\bterror\b/i,       27],
  [/\bmusical?\b/i,                          10402],
  [/\bmystery\b|\bmysterio/i,                9648],
  [/\bromance\b|\bromantic\b|\blove.stor/i,  10749],
  [/\bthriller\b/i,                          53],
  [/\bwar\b/i,                               10752],
  [/\bwestern\b/i,                           37],
  [/\bsuperher/i,                             28],  // map to action
  [/\banime\b/i,                             16],   // animation
  [/\bsitcom\b/i,                            35],   // comedy
  [/\bspy\b|\bagent\b/i,                     28],   // action
  [/\bsupernatural\b|\bghost\b|\bzombie\b/i, 27],   // horror
  [/\bdetective\b|\binvestigat/i,            80],   // crime
  [/\btalk.?show\b/i,                       10767],
  [/\breality/i,                            10764],
]

// ── Decade word → start year ───────────────────────────────────────────────
const DECADE_WORDS: Array<[RegExp, number]> = [
  [/\b(twenties|20s)\b/i,           1920],
  [/\b(thirties|30s)\b/i,           1930],
  [/\b(forties|40s)\b/i,            1940],
  [/\b(fifties|50s)\b/i,            1950],
  [/\b(sixties|60s)\b/i,            1960],
  [/\b(seventies|70s)\b/i,          1970],
  [/\b(eighties|80s)\b/i,           1980],
  [/\b(nineties|90s)\b/i,           1990],
  [/\b(two.?thousands?|2000s)\b/i,  2000],
  [/\b(twenty.?tens?|2010s)\b/i,    2010],
  [/\b(twenty.?twenties?|2020s)\b/i, 2020],
]

// ── Media type keywords ────────────────────────────────────────────────────
const MOVIE_PATTERNS = /\b(movies?|films?|cinema|feature)\b/i
const TV_PATTERNS    = /\b(tv|television|shows?|series|episodes?|seasons?|sitcoms?|miniseries)\b/i
const ANIME_PATTERN  = /\banime\b/i // anime is TV

// ── Quality / sort hints ───────────────────────────────────────────────────
const TOP_RATED_PATTERN = /\b(top.?rated|best|highest.?rated|acclaimed|award.?winning)\b/i
const RECENT_PATTERN    = /\b(recent|latest|new|newest)\b/i

// ── Structural words to strip from remaining query ─────────────────────────
// After extracting decade/genre/type, anything left is the "title hint".
const STRUCTURAL_PATTERNS: RegExp[] = [
  MOVIE_PATTERNS,
  TV_PATTERNS,
  ANIME_PATTERN,
  TOP_RATED_PATTERN,
  RECENT_PATTERN,
  /\b(from|in|the|of|and|with|like|about|starring|featuring|directed|by)\b/i,
  /\b\d{4}s?\b/,          // 4-digit years / decades
  /\b[12][90]\d{2}\b/,    // year numbers
  ...GENRE_MAP.map(([re]) => re),
  ...DECADE_WORDS.map(([re]) => re),
]

/**
 * Determine if a query is a conversational/descriptive query rather than
 * a direct title search (e.g. "scary 90s sci-fi" vs "inception").
 * Fast heuristic — no API call needed.
 */
export function isComplexQuery(query: string): boolean {
  const words = query.trim().split(/\s+/)
  // 4+ words is almost always descriptive
  if (words.length >= 4) return true

  const q = query.toLowerCase()

  // Contains genre / decade / media-type structural words?
  const hasGenre    = GENRE_MAP.some(([re]) => re.test(q))
  const hasDecade   = DECADE_WORDS.some(([re]) => re.test(q)) || /\b[12][90]\d{2}s?\b/.test(q)
  const hasType     = MOVIE_PATTERNS.test(q) || TV_PATTERNS.test(q) || ANIME_PATTERN.test(q)
  const hasQuality  = TOP_RATED_PATTERN.test(q) || RECENT_PATTERN.test(q)

  return hasGenre || hasDecade || (hasType && words.length >= 2) || hasQuality
}

/**
 * Parse a natural language query into structured TMDB Discover API filters.
 * Returns null if the query doesn't appear to be conversational / descriptive.
 *
 * This is a pure local implementation — no Gemini API, no network calls.
 */
export function parseQueryNLU(query: string): ParsedQuery | null {
  if (!isComplexQuery(query)) return null

  const filters: ParsedQuery['filters'] = {}
  let workingQuery = query

  // 1. Extract media type
  let detectedMediaType: 'movie' | 'tv' | undefined
  if (ANIME_PATTERN.test(workingQuery)) {
    detectedMediaType = 'tv'
  } else if (TV_PATTERNS.test(workingQuery)) {
    detectedMediaType = 'tv'
  } else if (MOVIE_PATTERNS.test(workingQuery)) {
    detectedMediaType = 'movie'
  }

  // 2. Extract decade from word patterns (e.g. "nineties", "80s")
  let decade: number | undefined
  for (const [pattern, startYear] of DECADE_WORDS) {
    if (pattern.test(workingQuery)) {
      decade = startYear
      break
    }
  }

  // 3. Extract 4-digit year / decade number (e.g. "2000", "1990s", "90s ambiguous")
  if (!decade) {
    // Full 4-digit year or decade like "2000s", "1990s"
    const yearMatch = workingQuery.match(/\b(1[89]\d{2}|20[012]\d)(s)?\b/)
    if (yearMatch) {
      const yr = parseInt(yearMatch[1], 10)
      // Round down to decade
      decade = Math.floor(yr / 10) * 10
    }
    // "90s" / "80s" short form without century prefix
    if (!decade) {
      const shortMatch = workingQuery.match(/\b([2-9]0)s\b/i)
      if (shortMatch) {
        const tens = parseInt(shortMatch[1], 10)
        // Disambiguate century: 20s-90s → most likely 1920-1990
        // 20s is ambiguous but default 1920 (very old films) less useful → treat 20s as 2020
        decade = tens === 20 ? 2020 : 1900 + tens
      }
    }
  }

  // 4. Apply date filters based on decade
  if (decade !== undefined) {
    const startYear = decade
    const endYear   = decade + 9

    if (detectedMediaType === 'tv') {
      filters['first_air_date.gte'] = `${startYear}-01-01`
      filters['first_air_date.lte'] = `${endYear}-12-31`
    } else {
      // Default to movie date filters; if both types are searched the hybridSearch
      // will run Discover for both using these same filters.
      filters['primary_release_date.gte'] = `${startYear}-01-01`
      filters['primary_release_date.lte'] = `${endYear}-12-31`
      // Also set TV dates so a combined discover works
      filters['first_air_date.gte'] = `${startYear}-01-01`
      filters['first_air_date.lte'] = `${endYear}-12-31`
    }
  }

  // 5. Extract genres — allow multiple
  const matchedGenreIds: number[] = []
  for (const [pattern, id] of GENRE_MAP) {
    if (pattern.test(workingQuery) && !matchedGenreIds.includes(id)) {
      matchedGenreIds.push(id)
    }
  }
  if (matchedGenreIds.length > 0) {
    // TMDB Discover `with_genres` is comma-separated AND logic
    // Use only the first two to avoid over-constraining
    filters.with_genres = matchedGenreIds.slice(0, 2).join(',')
  }

  // 6. Sort hint
  if (TOP_RATED_PATTERN.test(workingQuery)) {
    filters.sort_by = 'vote_average.desc'
    filters['vote_average.gte'] = '7'
  } else if (RECENT_PATTERN.test(workingQuery)) {
    filters.sort_by = 'primary_release_date.desc'
  } else {
    filters.sort_by = 'popularity.desc'
  }

  // 7. Extract remaining title query (non-structural text left over)
  let remaining = workingQuery
  for (const pattern of STRUCTURAL_PATTERNS) {
    remaining = remaining.replace(new RegExp(pattern.source, 'gi'), ' ')
  }
  remaining = remaining.replace(/\s{2,}/g, ' ').trim()

  // Only use as a text query if it looks like a meaningful title fragment
  const remainingQuery = remaining.length >= 3 ? remaining : undefined

  return {
    isConversational: true,
    remainingQuery,
    mediaType: detectedMediaType,
    filters,
  }
}
