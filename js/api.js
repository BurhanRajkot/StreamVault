import { CONFIG } from './config.js'

// Gets the URL for popular media based on mode
export function getPopularUrl(mode) {
  if (mode === 'anime') {
    return null // Anime mode doesn't fetch popular from TMDB
  }
  return `${CONFIG.TMDB_BASE_URL}/discover/${mode}?sort_by=popularity.desc&api_key=${CONFIG.TMDB_API_KEY}&page=1`
}

// Gets the URL for searching media based on mode
export function getSearchUrl(mode, query) {
  if (mode === 'anime') {
    return null // Anime mode uses a different search (or placeholder)
  }
  return `${CONFIG.TMDB_BASE_URL}/search/${mode}?api_key=${CONFIG.TMDB_API_KEY}&query=${query}`
}

// Fetches media from the API and returns the results
export async function fetchMedia(url) {
  if (url === null) {
    return 'anime_placeholder' // Special string for anime mode
  }

  try {
    const res = await fetch(url)
    const data = await res.json()
    return data.results // Return the data, don't show it
  } catch (error) {
    console.error('Error fetching media:', error)
    return 'error' // Return an error string
  }
}
