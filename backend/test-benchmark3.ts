import { supabaseAdmin } from './src/lib/supabase';
import { getUserProfile, invalidateUserProfile } from './src/cinematch/features/userProfile';

console.log('Testing UserProfile Optimization Idea...');

const INTERACTIONS_COUNT = 500;
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

// Override Supabase to return the interactions slowly to simulate network latency over large json payload
supabaseAdmin.from = (table: string) => {
  if (table === 'UserInteractions') {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => new Promise(resolve => {
               // Simulate network payload size latency
               setTimeout(() => resolve({ data: interactions, error: null }), 50)
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

import * as movieFeatures from './src/cinematch/features/movieFeatures';

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
  console.log(`Original Time: ${(end - start) / 50} ms`);
}

run().catch(console.error);


// Now let's test fetching Top 20 full, and doing something else for the rest.
// In reality, the issue text says: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
//
// But we actually have `UserGenreProfile` table which contains user's persisted genre Map!
// Wait! `seedFromPersistedProfile` is only used "For cold-start (<5 interactions), seeds from persisted DB profile."
//
// And the task says: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
// Wait, we don't really have a materialized view or DB-side aggregation. We could USE `UserGenreProfile` as the aggregated state!
// Oh, wait, the `updateGenreProfileIncremental` function inside `events.ts` ALREADY incrementally updates `UserGenreProfile` on EVERY interaction!
// And we also have `UserKeywordProfile`, `UserCastProfile` that were created in the migration!
// Look at `cinematch_migration.sql`:
// ```sql
// CREATE TABLE IF NOT EXISTS "UserGenreProfile" ...
// CREATE TABLE IF NOT EXISTS "UserKeywordProfile" ...
// CREATE TABLE IF NOT EXISTS "UserCastProfile" ...
// ```
//
// Does the code write to them? No, only `UserGenreProfile` is updated incrementally right now! (See `events.ts`)
// Ah, the task explicitly states: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
// We could replace the `limit(500)` with an RPC call to a Postgres function that aggregates the lists of watched, disliked, and favorited items, OR we can fetch 500 records but ONLY `tmdbId` and `eventType` to build the Sets, and fetch 20 records to get the recent items for `recentWatchMap` and vectors!
// No, the task says: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
