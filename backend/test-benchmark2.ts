import { supabaseAdmin } from './src/lib/supabase';
import { getUserProfile, invalidateUserProfile } from './src/cinematch/features/userProfile';

console.log('Testing UserProfile...');

const INTERACTIONS_COUNT = 500;
const BATCH_SIZE = 20;

const interactions = [];
for (let i = 0; i < INTERACTIONS_COUNT; i++) {
  interactions.push({
    userId: 'test1',
    tmdbId: 1000 + i,
    mediaType: 'movie',
    eventType: i % 10 === 0 ? 'dislike' : (i % 5 === 0 ? 'favorite' : 'watch'),
    weight: 1.0,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    progress: null,
  });
}

// Override Supabase to return the interactions quickly
supabaseAdmin.from = (table: string) => {
  if (table === 'UserInteractions') {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => new Promise(resolve => {
               // Simulate fast DB
               setTimeout(() => resolve({ data: interactions, error: null }), 5)
            })
          })
        })
      })
    } as any;
  }
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: { message: 'Not found' } })
      })
    })
  } as any;
};

// Mock feature batch fetching to speed things up
import * as movieFeatures from './src/cinematch/features/movieFeatures';
const getMovieFeaturesOrig = movieFeatures.getMovieFeatures;

(movieFeatures as any).getMovieFeatures = async (tmdbId: number) => {
    return {
        id: tmdbId,
        title: `Movie ${tmdbId}`,
        mediaType: 'movie',
        genreIds: [28, 12],
        keywords: [1, 2, 3],
        castIds: [10, 20, 30],
        directorId: 5,
        releaseDate: '2020-01-01',
        voteAverage: 8.0,
        voteCount: 1000,
        popularity: 50,
      };
};

async function run() {
  await getUserProfile('test1');
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    invalidateUserProfile('test1');
    await getUserProfile('test1');
  }
  const end = performance.now();
  console.log(`Average time per call: ${(end - start) / 50} ms`);
}

run().catch(console.error);
