import { buildSections } from './backend/src/cinematch/mixer/sectionBuilder';
import { ScoredCandidate, UserProfile } from './backend/src/cinematch/types/index';

const ranked: ScoredCandidate[] = [];
for (let i = 1; i <= 20; i++) {
  ranked.push({
    tmdbId: i,
    mediaType: 'tv',
    title: `Show ${i}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '',
    voteAverage: 8,
    voteCount: 100,
    popularity: 100,
    genreIds: [18], // Drama
    source: 'tmdb_similar',
    seedTitles: { 'tmdb_similar': 'Euphoria' },
    score: 100 - i,
    genreAffinityScore: 0,
    keywordAffinityScore: 0,
    castAffinityScore: 0,
    directorAffinityScore: 0,
    decadeAffinityScore: 0,
    popularityScore: 0,
    freshnessScore: 0,
    qualityScore: 0,
    sourceReason: ''
  });
}

// Add some other items
for (let i = 21; i <= 40; i++) {
  ranked.push({
    tmdbId: i,
    mediaType: 'tv',
    title: `Show ${i}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '',
    voteAverage: 8,
    voteCount: 100,
    popularity: 100,
    genreIds: [18], // Drama
    source: 'genre_discovery',
    seedTitles: { 'genre_discovery': 'Euphoria' },
    score: 100 - i,
    genreAffinityScore: 0,
    keywordAffinityScore: 0,
    castAffinityScore: 0,
    directorAffinityScore: 0,
    decadeAffinityScore: 0,
    popularityScore: 0,
    freshnessScore: 0,
    qualityScore: 0,
    sourceReason: ''
  });
}

const profile: UserProfile = {
  userId: '123',
  genreVector: {},
  keywordVector: {},
  castVector: {},
  directorVector: {},
  decadeVector: {},
  watchedIds: new Set(),
  favoritedIds: new Set(),
  dislikedIds: new Set(),
  categoryDislikeCounts: {},
  recentlyWatched: [],
  isNewUser: false
};

const sections = buildSections(ranked, profile);
console.log(sections.map(s => ({ title: s.title, itemIds: s.items.map(i => i.tmdbId) })));
