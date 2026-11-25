import type { Media } from '@/lib/config'
import { fetchDiscover } from './catalog'

/*
 * The admin-only 18+ shelf: erotic and sensual films and shows. Everything
 * here is ordinary TMDB catalogue (the backend never forwards include_adult,
 * so TMDB's adult-flagged titles stay out) — it is only kept off the screens
 * of anyone who isn't signed in as the admin.
 */

const API_BASE = import.meta.env.VITE_API_URL

/** TMDB keywords "erotic movie" and "sex" — films TMDB itself tags as erotic. */
const EROTIC_KEYWORDS = '190370|155477'

/** One page of erotic films, the most-watched first. */
export function fetchMatureMovies(page: number): Promise<Media[]> {
  return fetchDiscover('movie', {
    with_keywords: EROTIC_KEYWORDS,
    'vote_count.gte': '100',
    sort_by: 'popularity.desc',
    page: String(page),
  })
}

/**
 * Shows TMDB's keywords can't find (they tag anime ecchi, not drama), so
 * these are picked by hand: the sexiest, most sensual series, by TMDB id.
 */
const MATURE_SHOW_IDS = [
  85552, // Euphoria
  91239, // Bridgerton
  56570, // Outlander
  46296, // Spartacus
  126280, // Sex/Life
  89905, // Normal People
  76669, // Elite
  301507, // Heated Rivalry
  135251, // The Idol
  1215, // Californication
  10545, // True Blood
  34307, // Shameless
  47665, // Black Sails
  65817, // The Deuce
  58937, // Masters of Sex
  64387, // The Girlfriend Experience
  105214, // Dark Desire
  61664, // Sense8
  61463, // The Affair
  90812, // Industry
  86163, // Gentleman Jack
  900, // Skins
]

/** The hand-picked shows, in that order (one that fails to load is just left out). */
export async function fetchMatureShows(): Promise<Media[]> {
  const shows = await Promise.all<Media | null>(
    MATURE_SHOW_IDS.map(async (id) => {
      try {
        const res = await fetch(`${API_BASE}/tmdb/tv/${id}`)
        return res.ok ? { ...((await res.json()) as Media), media_type: 'tv' } : null
      } catch {
        return null
      }
    })
  )
  return shows.filter((s): s is Media => !!s?.poster_path)
}
