import { Candidate, UserProfile, CandidateSource } from '../types'

export function dislikedFilter(candidates: Candidate[], profile: UserProfile): Candidate[] {
  // We filter out explicit dislikes ONLY if they come from personalized sources
  // Trending, popular, etc are global and should not be filtered out
  const personalizedSources: CandidateSource[] = [
    'tmdb_recommendations',
    'tmdb_similar',
    'genre_discovery',
    'collaborative'
  ];

  return candidates.filter(c => {
    // If user explicitly disliked it AND it's a personalized recommendation, hide it completely.
    if (profile.dislikedIds.has(c.tmdbId) && personalizedSources.includes(c.source)) {
      return false;
    }
    return true;
  });
}
