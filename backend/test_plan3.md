So the user requested to optimize the DB interaction "Sequential DB interaction in userProfile update" and specifically mentioned "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."

Actually, let's create a materialized view OR a regular View, OR an RPC.
An RPC named `get_user_profile_data` is the most flexible because it can take `userId` as an argument.

```sql
CREATE OR REPLACE FUNCTION get_user_profile_data(p_user_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_recent JSONB;
  v_watched JSONB;
  v_favorited JSONB;
  v_disliked JSONB;
  v_total_count INT;
BEGIN
  -- Get top 20 interactions
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT "tmdbId", "mediaType", "eventType", "weight", "createdAt", "progress"
    FROM "UserInteractions"
    WHERE "userId" = p_user_id
    ORDER BY "createdAt" DESC
    LIMIT 20
  ) t;

  -- Get aggregates for sets, capped at last 500 interactions
  -- Also count total inside the 500 limit (which gives us length <= 500, enough for isNewUser logic)
  SELECT
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'watch'), '[]'::jsonb),
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'favorite'), '[]'::jsonb),
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'dislike'), '[]'::jsonb),
    COUNT(*)
  INTO v_watched, v_favorited, v_disliked, v_total_count
  FROM (
    SELECT "tmdbId", "eventType"
    FROM "UserInteractions"
    WHERE "userId" = p_user_id
    ORDER BY "createdAt" DESC
    LIMIT 500
  ) top500;

  RETURN jsonb_build_object(
    'interactions', v_recent,
    'watchedIds', v_watched,
    'favoritedIds', v_favorited,
    'dislikedIds', v_disliked,
    'totalInteractions', v_total_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Wait, if we change the backend to use an RPC `supabaseAdmin.rpc('get_user_profile_data', { p_user_id: userId })`, it will break if the migration hasn't run. So we must put the migration file in `backend/supabase/migrations/20260303000000_profile_optimization.sql`.
AND we need to make sure the backend handles it gracefully if the RPC doesn't exist (fallback to old query)?
"Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DO blocks" -> we don't have to worry about fallback if we assume migrations run. The instructions say we should assume the codebase is the source of truth, and we should just make the changes.

Wait, is there an existing RPC file? No, just SQL files.
Let's see if there is another approach.
Materialized views are hard to keep updated synchronously with interaction tracking. They would need a trigger, which might be overkill compared to an RPC that just aggregates on the fly but much faster because it only returns a small JSON object.

Wait, "Sequential DB interaction in userProfile update" - does the `getUserProfile` have sequential DB interactions?
1. `seedFromPersistedProfile` does `supabaseAdmin.from('UserGenreProfile').select('genreMap').eq('userId', userId).single()`
2. `supabaseAdmin.from('UserInteractions').select('...').limit(500)`
Oh! `seedFromPersistedProfile` is called IF `interactions.length < 5`!
Wait:
```typescript
  // Fetch all interaction events (last 500 for richer vectors)
  const { data: interactions, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt, progress')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(500)

  // ...
  // For cold-start: seed from persisted genre profile first
  if (interactions.length < 5) {
    const seeded = await seedFromPersistedProfile(userId, genreVector)
...
```
This is a sequential DB operation!
First it fetches interactions. Then, if `< 5`, it fetches `UserGenreProfile`.
BUT `UserGenreProfile` is incrementally updated!
Wait, actually `UserGenreProfile` ALREADY CONTAINS the up-to-date genre vector for ALL interactions!
Look at `updateGenreProfileIncremental` in `events.ts`. It's updated ON EVERY INTERACTION!
Why is the code dynamically rebuilding the `genreVector` from the last 20 interactions at all???
Because `UserGenreProfile` was added later! Look at the migration!
"2. UserGenreProfile... 3. UserKeywordProfile (NEW)..."
Ah! The `cinematch_migration.sql` was updated recently to add `UserKeywordProfile` and `UserCastProfile`.
But `updateGenreProfileIncremental` only updates `UserGenreProfile`.

Is it possible the user wants us to just use `UserGenreProfile` as the materialized view? No, the issue is about "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."

I will create a SQL view / RPC and optimize `getUserProfile` to use it.
