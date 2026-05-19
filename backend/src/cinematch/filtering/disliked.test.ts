import { expect, test, describe } from 'bun:test';
import { dislikedFilter } from './disliked';
import { Candidate, UserProfile, CandidateSource } from '../types';

describe('dislikedFilter', () => {
  const createMockCandidate = (id: number, source: CandidateSource): Candidate => ({
    tmdbId: id,
    mediaType: 'movie',
    title: `Mock Movie ${id}`,
    posterPath: null,
    backdropPath: null,
    overview: 'Test overview',
    releaseDate: '2023-01-01',
    voteAverage: 5,
    voteCount: 100,
    popularity: 10,
    genreIds: [],
    source: source,
  });

  const createMockProfile = (dislikedIds: number[]): UserProfile => ({
    userId: 'test-user',
    genreVector: {},
    keywordVector: {},
    castVector: {},
    directorVector: {},
    decadeVector: {},
    watchedIds: new Set(),
    favoritedIds: new Set(),
    dislikedIds: new Set(dislikedIds),
    categoryDislikeCounts: {},
    recentlyWatched: [],
    isNewUser: false,
  });

  test('filters out disliked candidate from personalized source', () => {
    const candidates = [
      createMockCandidate(1, 'tmdb_recommendations'),
      createMockCandidate(2, 'tmdb_similar'),
    ];
    const profile = createMockProfile([1]);

    const result = dislikedFilter(candidates, profile);

    expect(result).toHaveLength(1);
    expect(result[0].tmdbId).toBe(2);
  });

  test('keeps disliked candidate from global source', () => {
    const candidates = [
      createMockCandidate(1, 'trending'),
      createMockCandidate(2, 'popular_fallback'),
    ];
    const profile = createMockProfile([1, 2]);

    const result = dislikedFilter(candidates, profile);

    expect(result).toHaveLength(2);
    expect(result[0].tmdbId).toBe(1);
    expect(result[1].tmdbId).toBe(2);
  });

  test('keeps non-disliked candidates from any source', () => {
    const candidates = [
      createMockCandidate(1, 'tmdb_recommendations'),
      createMockCandidate(2, 'trending'),
    ];
    const profile = createMockProfile([3]);

    const result = dislikedFilter(candidates, profile);

    expect(result).toHaveLength(2);
  });

  test('handles empty candidates array', () => {
    const profile = createMockProfile([1, 2]);
    const result = dislikedFilter([], profile);
    expect(result).toHaveLength(0);
  });

  test('handles empty dislikedIds set', () => {
    const candidates = [
      createMockCandidate(1, 'tmdb_recommendations'),
      createMockCandidate(2, 'trending'),
    ];
    const profile = createMockProfile([]);

    const result = dislikedFilter(candidates, profile);

    expect(result).toHaveLength(2);
  });
});
