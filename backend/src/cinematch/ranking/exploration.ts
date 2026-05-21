import { ScoredCandidate, UserProfile } from '../types'

// Multi-Armed Bandit / Epsilon-Greedy approach to recommendation discovery
// Injects a small percentage of out-of-profile or lower-ranked items into the top
// to prevent "echo chambers" where users only ever see what they already watched.
export function applyWildcardInjection(
  ranked: ScoredCandidate[],
  profile: UserProfile
): ScoredCandidate[] {
  // If the user is new, their profile is completely empty/undeveloped,
  // we want to rely on the cold start and popularity models, not randomize.
  if (profile.isNewUser || ranked.length < 20) {
    return ranked
  }

  // Sort strictly by score first
  const sorted = [...ranked].sort((a, b) => b.score - a.score)

  // Define epsilon: 5% chance to inject a wildcard, but practically we'll
  // pick ~2-3 items from the bottom half and insert them into the top 20
  const topK = 20
  const wildcardCount = 2

  const topSlice = sorted.slice(0, topK)
  const bottomSlice = sorted.slice(topK)

  if (bottomSlice.length < wildcardCount) {
    return sorted
  }

  // Find candidates in bottom slice whose top genres are NOT in the user's top genres
  const userTopGenres = new Set(
    Object.entries(profile.genreVector)
      .filter(([, weight]) => weight > 0.5)
      .map(([id]) => Number(id))
  )

  const wildcardCandidates: ScoredCandidate[] = []

  for (const candidate of bottomSlice) {
    if (wildcardCandidates.length >= wildcardCount) break

    // Check if it's an "out of profile" candidate
    const isDifferent = candidate.genreIds.some(gId => !userTopGenres.has(gId))

    if (isDifferent) {
      // Artificially boost the score slightly so it visually fits in,
      // but flag the source reason as a discovery item
      const boostCandidate = {
        ...candidate,
        score: topSlice[topSlice.length - 1].score + 0.01, // Just enough to make it into top K
        sourceReason: 'Surprise me! Discovery pick',
        source: 'genre_discovery' as const
      }
      wildcardCandidates.push(boostCandidate)
    }
  }

  // Insert wildcards randomly into the top 20
  for (const wildcard of wildcardCandidates) {
    // Insert between index 4 and 15
    const insertIdx = Math.floor(Math.random() * 11) + 4
    topSlice.splice(insertIdx, 0, wildcard)
    // Remove the last item to keep length consistent and add it back to the bottom pool
    const popped = topSlice.pop()
    if (popped) {
      bottomSlice.unshift(popped)
    }
  }

  // Combine back
  return [...topSlice, ...bottomSlice.filter(c => !wildcardCandidates.find(w => w.tmdbId === c.tmdbId))]
}
