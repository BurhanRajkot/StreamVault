import { logger } from '../../lib/logger'
import { TMDB_GENRES } from '../types'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const MODEL_NAME = 'gpt-4o-mini'

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
  }
}

/**
 * Determine if a query is likely a conversational/complex query rather than
 * just a direct title search (e.g. "scary 90s sci fi movies" vs "inception").
 * We use a fast heuristic to save LLM calls on simple searches.
 */
export function isComplexQuery(query: string): boolean {
  const words = query.split(/\s+/)
  // If it's 4 or more words, or contains descriptive keywords
  if (words.length >= 4) return true
  
  const descriptiveWords = ['movies', 'shows', 'from', 'about', 'like', 'with', 'directed', 'years', 'scary', 'funny']
  const queryLower = query.toLowerCase()
  return descriptiveWords.some(w => queryLower.includes(w))
}

/**
 * Parses a natural language search query into structured TMDB discover filters using RAG/LLM.
 * Returns null if the parse fails or if it's not conversational.
 */
export async function parseQueryNLU(query: string): Promise<ParsedQuery | null> {
  if (!OPENAI_API_KEY || !isComplexQuery(query)) {
    return null
  }

  const genreMapString = Object.entries(TMDB_GENRES)
    .map(([id, name]) => `${name} (${id})`)
    .join(', ')

  const prompt = `
You are a media search query parser equivalent to Netflix's DSL RAG layer.
The user's query may contain descriptive language, genres, decades, or media types.
Available TMDB Genres (ID format): ${genreMapString}

Return a strictly valid JSON object with the following schema:
{
  "isConversational": boolean, // true if this is descriptive (e.g. "90s action movies"), false if it looks like a specific title (e.g. "The Dark Knight")
  "remainingQuery": string, // The core subject matter if applicable. Can be empty.
  "mediaType": "movie" | "tv", // Omit if unspecified
  "genres": number[], // Array of matched genre IDs
  "decade": number // e.g. 1990. Omit if unspecified
}

Query: "${query}"
`
  try {
    const startTime = Date.now()
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.0,
      })
    })

    if (!response.ok) {
        logger.warn('[NLU] OpenAI API failed for query parsing')
        return null
    }

    const data = await response.json()
    const parsed = JSON.parse(data.choices[0].message.content)

    if (!parsed.isConversational) {
      return null
    }

    const filters: ParsedQuery['filters'] = {}
    
    if (parsed.genres && Array.isArray(parsed.genres) && parsed.genres.length > 0) {
      filters.with_genres = parsed.genres.join(',')
    }

    if (parsed.decade) {
      const startYear = parsed.decade
      const endYear = startYear + 9
      if (parsed.mediaType === 'tv') {
        filters['first_air_date.gte'] = `${startYear}-01-01`
        filters['first_air_date.lte'] = `${endYear}-12-31`
      } else {
        filters['primary_release_date.gte'] = `${startYear}-01-01`
        filters['primary_release_date.lte'] = `${endYear}-12-31`
      }
    }

    logger.info('[NLU] Query parsed via LLM', { 
      query, 
      parsed, 
      latencyMs: Date.now() - startTime 
    })

    return {
      isConversational: true,
      remainingQuery: parsed.remainingQuery,
      mediaType: parsed.mediaType,
      filters
    }
  } catch (err: any) {
    logger.error('[NLU] Query parsing error', { error: err.message })
    return null
  }
}
