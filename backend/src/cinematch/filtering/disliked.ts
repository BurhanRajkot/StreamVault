import { Candidate, UserProfile, CandidateSource } from '../types'

// Define the set outside the function to avoid recreating it on every call.
const personalizedSources = new Set<CandidateSource>([
  'tmdb_recommendations',
  'tmdb_similar',
  'genre_discovery',
  'keyword_discovery',
  'cast_discovery',
  'collaborative',
  'graph_traversal',
]);

export function dislikedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  // We filter out explicit dislikes ONLY if they come from personalized sources
  // Trending, popular, etc are global and should not be filtered out
  return candidates.filter(c => {
    // If user explicitly disliked it AND it's a personalized recommendation, hide it completely.
    if (profile.dislikedIds.has(c.tmdbId) && personalizedSources.has(c.source)) {
      return false;
    }
    return true;
  });
}
