-- Migration to fix role mutable search_path in functions
-- This prevents search_path injection attacks by explicitly setting it

-- 1. Fix match_movies_from_user_embedding
CREATE OR REPLACE FUNCTION public.match_movies_from_user_embedding(
  query_embedding vector(64),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  "tmdbId" integer,
  "similarity" float
)
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me."tmdbId",
    -- Negative inner product operator <#> gives -1 * dot product
    -- Multiply by -1 again to get the actual positive dot product score
    (me.embedding <#> query_embedding) * -1 AS similarity
  FROM public."movie_embeddings" me
  -- Order by highest dot product first
  ORDER BY me.embedding <#> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 2. Fix get_user_profile_data
CREATE OR REPLACE FUNCTION public.get_user_profile_data(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
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
    FROM public."UserInteractions"
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
    FROM public."UserInteractions"
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
$$;
