import { Media } from './config'

/**
 * Normalizes text by removing diacritics (accents) and lowercasing.
 * Crucial for international queries like "Amélie" vs "Amelie"
 */
export function normalizeText(text: string): string {
  if (!text) return ''
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Calculates the Levenshtein distance between two strings.
 * Used for typo tolerance.
 */
export function levenshteinDistance(s: string, t: string): number {
  if (!s.length) return t.length
  if (!t.length) return s.length

  const arr = []
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i]
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] =
        i === 0
          ? j
          : Math.min(
              arr[i - 1][j] + 1,
              arr[i][j - 1] + 1,
              arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
            )
    }
  }
  return arr[t.length][s.length]
}

/**
 * Jaro-Winkler distance calculation.
 * Returns a value between 0 (no match) and 1 (exact match).
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0

  const len1 = s1.length
  const len2 = s2.length

  if (len1 === 0 || len2 === 0) return 0.0

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1
  const matches1 = new Array(len1).fill(false)
  const matches2 = new Array(len2).fill(false)

  let matches = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, len2)
    for (let j = start; j < end; j++) {
      if (matches2[j]) continue
      if (s1[i] !== s2[j]) continue
      matches1[i] = true
      matches2[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let t = 0
  let point = 0
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[point]) point++
      if (s1[i] !== s2[point]) t++
      point++
    }
  }

  t = t / 2.0

  const jaro = (matches / len1 + matches / len2 + (matches - t) / matches) / 3.0

  // Winkler Modification
  let prefix = 0
  const maxPrefix = Math.min(4, Math.min(len1, len2))
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

/**
 * Bayesian Average Rating
 * v: number of votes for the movie
 * m: minimum votes required to be considered (e.g. 500)
 * R: average rating for the movie
 * C: mean vote across the whole report (e.g. 6.5)
 */
export function bayesianAverage(v: number, m: number, R: number, C: number): number {
  return (v / (v + m)) * R + (m / (v + m)) * C
}

/**
 * Mathematical relevancy engine that hybridizes
 * string similarity with popularity and ratings.
 */
export function calculateRelevance(media: Media, query: string, fuzzyScore: number = 1): number {
  const title = normalizeText(media.title || media.name || '')
  const q = normalizeText(query)

  // 1. Text Similarity Score (0 to 1)
  const jwScore = jaroWinkler(q, title)
  const levDist = levenshteinDistance(q, title)

  // Convert Levenshtein to a 0-1 score
  const maxLength = Math.max(q.length, title.length)
  const levScore = maxLength > 0 ? 1 - levDist / maxLength : 0

  // Give weight to both JW and Lev, or exact substring matches
  let textScore = Math.max(jwScore, levScore) * 0.8

  // Look in alternate titles as well to boost score
  const altTitles = (media as any).altTitles || ((media as any).normalizedTitle ? [(media as any).normalizedTitle] : [])
  for (const alt of altTitles) {
      const normalizedAlt = normalizeText(alt)
      if (normalizedAlt === q) textScore = Math.max(textScore, 0.95);
      if (normalizedAlt.includes(q)) textScore = Math.max(textScore, 0.85);
  }

  if (title.includes(q)) {
      textScore = Math.max(textScore, 0.9) // Strong boost for exact substring
  }
  if (title === q) {
      textScore = 1.0 // Perfect match
  }

  // Multiply by Fuse.js score (which also incorporates altTitles & overview)
  // fuseScore goes from 0 (perfect) to 1 (terrible). So we invert it.
  const fuseMultiplier = fuzzyScore !== undefined ? (1 - fuzzyScore) : 1
  textScore = (textScore * 0.7) + (fuseMultiplier * 0.3)

  // 2. Popularity Logarithmic Curve
  const popularity = (media as any).popularity || 0
  // log10(x + 10) to smoothen the curve. 10 popularity = 1.3, 100 pop = 2.0, 1000 pop = 3.0
  const popularityScore = Math.log10(popularity + 10) / 3.0 // Normalize around 0-1 for top movies

  // 3. Bayesian Rating Bonus
  const voteCount = (media as any).vote_count || 0
  const voteAvg = media.vote_average || 0
  const bayesian = bayesianAverage(voteCount, 500, voteAvg, 6.5)
  // Scale to 0-1 (bayesian max is ~10)
  const qualityScore = Math.max(0, (bayesian - 5)) / 5.0

  // 4. Exponential Time Decay Penalty
  // e.g. e^(-age_in_years * 0.05). Slow decay.
  let timeScore = 1.0
  const releaseDate = media.release_date || media.first_air_date
  if (releaseDate) {
      const year = new Date(releaseDate).getFullYear()
      const currentYear = new Date().getFullYear()
      const age = Math.max(0, currentYear - year)
      timeScore = Math.exp(-age * 0.02) // Penalize older movies, but very slowly

      // If the movie is a classic (high quality), reduce the penalty
      if (bayesian >= 7.5) {
          timeScore = Math.max(timeScore, 0.8) // Classics don't decay past 0.8
      }
  }

  // -------- FINAL ENSEMBLE --------
  // A string that doesn't match shouldn't win just because it's popular
  if (textScore < 0.3) return textScore * 0.1

  // Weight combination
  // Text match is paramount. Quality and Popularity break ties. Time decays slightly.
  const finalScore = (
      (textScore * 0.55) +
      (popularityScore * 0.25) +
      (qualityScore * 0.20)
  ) * timeScore

  return finalScore
}
