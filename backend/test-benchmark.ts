import { getUserProfile } from './src/cinematch/features/userProfile';
import { supabaseAdmin } from './src/lib/supabase';

// In `getUserProfile`, it does:
// 1. Fetch 500 interactions from UserInteractions
// 2. Fetch features from getMovieFeatures for the TOP 20 interactions.
// 3. Process the 500 interactions:
//   - Calculate time decay
//   - Add to `dislikedIds`, `watchedIds`, `favoritedIds` based on interaction.
//   - IF idx < FEATURE_BATCH_SIZE (which is 20):
//       - Update vectors (genre, keyword, cast, director, decade) and `recentWatchMap`.
//
// WAIT, the code ONLY processes features for `idx < FEATURE_BATCH_SIZE`.
// So for idx >= 20, the code loop DOES NOT update any vectors!
// It ONLY adds to `dislikedIds`, `watchedIds`, and `favoritedIds`!
//
// Let's verify this in the source code:
// ```
//    if (idx < FEATURE_BATCH_SIZE) {
//       const result = featureBatch[idx]
//       ...
// ```
//
// Yes! The loop iterates over 500 interactions, but for indices 20..499,
// it ONLY sets `dislikedIds`, `watchedIds`, and `favoritedIds`.
// It doesn't fetch features, so it doesn't know the genres, keywords, cast, etc. for the older 480 items.
//
// This is a HUGE optimization opportunity!
// We only need the full interactions for the top 20!
// For the remaining 480, we only need `tmdbId` and `eventType` to build the `Set`s!
//
// Even better, instead of fetching 500 full records (which involves scanning and returning a large JSON payload),
// we can do two separate targeted fetches, OR just fetch the few columns we need, OR, best of all,
// use an optimized query to just get the `tmdbId` and `eventType`.
// Actually, even fetching 500 rows with 6 columns is somewhat slow.
//
// Wait, the current query is:
// .select('tmdbId, mediaType, eventType, weight, createdAt, progress')
// .limit(500)
//
// We can optimize this by doing one single query, but selecting less, or since we only need the 500 rows...
// Wait, is there a better way?
//
// What if we limit to 500, but only fetch the IDs? But we need createdAt for the first 20.
// Is fetching 500 rows really the bottleneck? Let's write a benchmark.
