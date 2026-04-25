1. We want to avoid fetching 500 interactions dynamically every time `getUserProfile` is called.
2. The user profile only uses interactions 20-500 to extract `watchedIds`, `favoritedIds`, and `dislikedIds`.
3. If we can get these sets with a much lighter query, or better yet, without scanning all the rows and passing them over the network.
4. However, the exact text of the problem is: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
5. Let's write an RPC (Postgres Function) that does all the work of finding the top 500 interactions, grabbing the sets, and grabbing the top 20 interactions.
Wait! Even if we do an RPC, is that really a "DB-side aggregation"? Yes! "aggregations" or "materialized views".

Wait, does Supabase already have an RPC we can use, or should we create a migration?
The user is telling us to implement an optimization. If we create a new migration, we must add it to `supabase/migrations`.
BUT, we might not have the DB running right now. The code connects to Supabase via `@supabase/supabase-js`.

Wait, is there a simpler way? What if we just fetch `tmdbId` and `eventType` for the 500, but fetch the full data for 20? No, that's not "DB-side aggregation".

Let's look at the data we need from 500 records:
We need all unique `watchedIds`, `favoritedIds`, `dislikedIds` from the last 500 interactions.
And we need the top 20 interactions `(tmdbId, mediaType, eventType, weight, createdAt, progress)`.

If we write a Supabase RPC `get_user_profile_data`:
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
  SELECT jsonb_agg(row_to_json(t))
  INTO v_recent
  FROM (
    SELECT "tmdbId", "mediaType", "eventType", "weight", "createdAt", "progress"
    FROM "UserInteractions"
    WHERE "userId" = p_user_id
    ORDER BY "createdAt" DESC
    LIMIT 20
  ) t;

  -- Count total interactions
  SELECT COUNT(*) INTO v_total_count
  FROM "UserInteractions"
  WHERE "userId" = p_user_id;

  -- Get sets from top 500
  SELECT
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'watch'), '[]'::jsonb),
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'favorite'), '[]'::jsonb),
    COALESCE(jsonb_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'dislike'), '[]'::jsonb)
  INTO v_watched, v_favorited, v_disliked
  FROM (
    SELECT "tmdbId", "eventType"
    FROM "UserInteractions"
    WHERE "userId" = p_user_id
    ORDER BY "createdAt" DESC
    LIMIT 500
  ) top500;

  RETURN jsonb_build_object(
    'interactions', COALESCE(v_recent, '[]'::jsonb),
    'watchedIds', COALESCE(v_watched, '[]'::jsonb),
    'favoritedIds', COALESCE(v_favorited, '[]'::jsonb),
    'dislikedIds', COALESCE(v_disliked, '[]'::jsonb),
    'totalInteractions', v_total_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Wait, if we use an RPC, we have to run a migration. Is that allowed in this task? Yes, there is a `migrations` folder.
Let's see if we can do something without an RPC.
Can we just fetch only the specific columns we need?
`const { data } = await supabaseAdmin.from('UserInteractions').select('tmdbId, eventType').eq('userId', userId).order('createdAt', { ascending: false }).limit(500);`
And then just fetch the top 20 fully:
`const { data: top20 } = await supabaseAdmin.from('UserInteractions').select('...').eq('userId', userId).order('createdAt', { ascending: false }).limit(20);`

Wait, that's two queries. It's better than fetching 500 FULL rows over the network, but it's not a "DB-side aggregation".
Let's read the issue again: "Fetching up to 500 interactions just to construct a profile dynamically every time could be heavily optimized via DB-side aggregations or materialized views."
This suggests we SHOULD implement a DB-side aggregation (e.g. an RPC returning aggregated arrays or a View) or a Materialized View.

Since "interactions" change constantly, a true materialized view would need to be refreshed constantly. An RPC is probably the best form of "DB-side aggregation".
Actually, wait! Is there a way to do it with just a normal View?
If we create a View:
```sql
CREATE OR REPLACE VIEW "UserInteractionAggregates" AS
SELECT "userId",
       count(*) as "interactionCount",
       array_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'watch') as "watchedIds",
       array_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'favorite') as "favoritedIds",
       array_agg(DISTINCT "tmdbId") FILTER (WHERE "eventType" = 'dislike') as "dislikedIds"
FROM (
   SELECT "userId", "tmdbId", "eventType",
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) as rn
   FROM "UserInteractions"
) sub
WHERE rn <= 500
GROUP BY "userId";
```
Then we can just fetch from this view!
`const { data: aggregates } = await supabaseAdmin.from('UserInteractionAggregates').select('*').eq('userId', userId).single();`
And then fetch the top 20 interactions for the vector math!

Let's check if there are existing migrations:
