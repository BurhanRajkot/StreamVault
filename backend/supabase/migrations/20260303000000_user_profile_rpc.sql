-- ============================================================================
-- Profile Optimization RPC
-- This RPC significantly speeds up the `getUserProfile` routine by moving
-- the heavy extraction of 500 rows to the database.
-- It returns just the 20 most recent full rows and the aggregated IDs for the last 500.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_profile_data(p_user_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_recent JSONB;
  v_watched JSONB;
  v_favorited JSONB;
  v_disliked JSONB;
  v_total_count INT;
BEGIN
  -- 1. Fetch top 20 full interactions
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT "tmdbId", "mediaType", "eventType", "weight", "createdAt", "progress"
    FROM "UserInteractions"
    WHERE "userId" = p_user_id
    ORDER BY "createdAt" DESC
    LIMIT 20
  ) t;

  -- 2. Aggregate watched/favorited/disliked sets for up to 500 recent interactions
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
