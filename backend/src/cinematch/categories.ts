// ============================================================
// CineMatch AI — Semantic Genre Categories
//
// Maps human-readable content categories to TMDB genre IDs.
// A movie belongs to a category if it shares ≥1 genre ID with
// that category's set.
//
// Used to:
//   1. Score per-category dislike counts in user profiles
//   2. Suppress fully-rejected categories from recommendations
// ============================================================

export const CATEGORIES = {
  action:      { name: 'Action',           genres: new Set([28, 12]) },
  romcom:      { name: 'Rom-Com',          genres: new Set([10749, 35]) },
  horror:      { name: 'Horror',           genres: new Set([27]) },
  scifi:       { name: 'Sci-Fi',           genres: new Set([878, 10765]) },
  medieval:    { name: 'Medieval Fantasy', genres: new Set([14, 36, 10752]) },
  thriller:    { name: 'Thriller',         genres: new Set([53, 9648]) },
  crime:       { name: 'Crime',            genres: new Set([80]) },
  animation:   { name: 'Animation',        genres: new Set([16, 10762]) },
  documentary: { name: 'Documentary',      genres: new Set([99]) },
  drama:       { name: 'Drama',            genres: new Set([18]) },
  comedy:      { name: 'Comedy',           genres: new Set([35]) },
  family:      { name: 'Family',           genres: new Set([10751]) },
  superhero:   { name: 'Superhero',        genres: new Set([28, 878]) },
  reality:     { name: 'Reality TV',       genres: new Set([10764, 10767]) },
  war:         { name: 'War',              genres: new Set([10752, 36]) },
  mystery:     { name: 'Mystery',          genres: new Set([9648]) },
  history:     { name: 'History',          genres: new Set([36]) },
  music:       { name: 'Music',            genres: new Set([10402]) },
  western:     { name: 'Western',          genres: new Set([37]) },
} as const

export type CategoryKey = keyof typeof CATEGORIES

/**
 * Returns which categories a movie/show belongs to based on its TMDB genre IDs.
 * A movie may belong to multiple categories (e.g. an action sci-fi belongs to
 * both 'action' and 'scifi').
 */
export function getCategoriesForGenres(genreIds: number[]): CategoryKey[] {
  const genreSet = new Set(genreIds)
  const matched: CategoryKey[] = []

  for (const [key, category] of Object.entries(CATEGORIES) as [CategoryKey, typeof CATEGORIES[CategoryKey]][]) {
    for (const gid of category.genres) {
      if (genreSet.has(gid)) {
        matched.push(key)
        break  // Only add each category once per movie
      }
    }
  }

  return matched
}
