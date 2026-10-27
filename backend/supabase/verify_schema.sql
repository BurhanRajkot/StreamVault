-- ============================================================
-- Schema drift report
--
-- Not a migration — a read-only check. Paste into the Supabase SQL editor
-- and read the rows: problems sort to the top, and every row should say OK.
--
-- It checks the live database against what
-- migrations/20261027000000_streamvault_schema.sql builds. If anything has
-- drifted (a dashboard edit, a hand-made policy), re-running that migration
-- puts it back.
-- ============================================================

WITH
tables(name) AS (
  VALUES ('User'), ('Favorite'), ('ContinueWatching'), ('Download'), ('subscription_requests'),
         ('UserInteractions'), ('UserGenreProfile'), ('RecommendationCache'),
         ('PositionBiasLog'), ('ml_interactions'), ('movie_embeddings')
),
constraints(tbl, name) AS (
  VALUES
    ('User', 'user_id_check'), ('User', 'user_subscription_status_check'),
    ('Favorite', 'favorite_user_fkey'), ('Favorite', 'favorite_user_media_key'),
    ('ContinueWatching', 'continue_watching_user_fkey'), ('ContinueWatching', 'continue_watching_user_media_key'),
    ('ContinueWatching', 'continue_watching_progress_check'),
    ('Download', 'download_filename_key'), ('Download', 'download_external_url_check'),
    ('subscription_requests', 'subscription_requests_user_fkey'),
    ('subscription_requests', 'subscription_requests_transaction_id_key'),
    ('subscription_requests', 'subscription_requests_status_check'),
    ('UserInteractions', 'user_interactions_user_fkey'), ('UserInteractions', 'user_interactions_event_type_check'),
    ('UserInteractions', 'user_interactions_weight_check'),
    ('UserGenreProfile', 'user_genre_profile_user_fkey'),
    ('RecommendationCache', 'recommendation_cache_user_fkey'),
    ('PositionBiasLog', 'position_bias_log_user_fkey'),
    ('ml_interactions', 'ml_interactions_user_fkey'), ('ml_interactions', 'ml_interactions_actor_check')
),
indexes(name) AS (
  VALUES ('idx_user_active_expiry'), ('idx_favorite_user_created'), ('idx_continue_watching_user_updated'),
         ('idx_download_created_at'), ('idx_subscription_requests_created_at'),
         ('idx_subscription_requests_user_id'), ('idx_subscription_requests_one_intro'),
         ('idx_interactions_user_created'), ('idx_interactions_peer_lookup'), ('idx_position_bias_user'),
         ('idx_position_bias_window'), ('ml_interactions_user_id_idx'), ('ml_interactions_timestamp_idx'),
         ('movie_embeddings_embedding_idx')
),
functions(name) AS (
  VALUES ('approve_subscription_request'), ('get_position_bias_ctr'), ('match_movies_from_user_embedding'),
         ('set_updated_at'), ('ensure_user_exists'), ('stamp_subscription_review')
),
cron_jobs(name) AS (
  VALUES ('positionbiaslog-retention'), ('recommendation-cache-cleanup'), ('subscription-expiry')
),
-- cron.job only exists when pg_cron is installed, and a plain reference would
-- fail the whole query at plan time. query_to_xml() defers it to run time.
scheduled AS (
  SELECT CASE WHEN to_regclass('cron.job') IS NULL THEN NULL::text[]
              ELSE string_to_array(coalesce((xpath('/row/j/text()', query_to_xml(
                     'SELECT string_agg(jobname, '','') AS j FROM cron.job', false, true, '')))[1]::text, ''), ',')
         END AS names
),
checks AS (
  SELECT 1 AS sort, 'table ' || t.name AS item,
         CASE WHEN c.oid IS NULL THEN 'MISSING'
              WHEN NOT c.relrowsecurity THEN 'RLS DISABLED'
              ELSE 'OK' END AS status
  FROM tables t
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', t.name))

  UNION ALL
  SELECT 2, 'public key access to ' || t.name,
         CASE WHEN has_table_privilege('anon', format('public.%I', t.name), 'SELECT, INSERT, UPDATE, DELETE')
                OR has_table_privilege('authenticated', format('public.%I', t.name), 'SELECT, INSERT, UPDATE, DELETE')
              THEN 'EXPOSED' ELSE 'OK' END
  FROM tables t
  WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL

  UNION ALL
  SELECT 3, 'policy ' || p.tablename || '.' || p.policyname, 'UNEXPECTED'
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename IN (SELECT name FROM tables)

  UNION ALL
  SELECT 4, 'constraint ' || k.tbl || '.' || k.name,
         CASE WHEN c.oid IS NULL THEN 'MISSING'
              WHEN NOT c.convalidated THEN 'NOT VALIDATED'
              ELSE 'OK' END
  FROM constraints k
  LEFT JOIN pg_constraint c ON c.conname = k.name AND c.conrelid = to_regclass(format('public.%I', k.tbl))

  UNION ALL
  SELECT 5, 'index ' || i.name,
         CASE WHEN to_regclass(format('public.%I', i.name)) IS NULL THEN 'MISSING' ELSE 'OK' END
  FROM indexes i

  UNION ALL
  SELECT 6, 'function ' || f.name,
         CASE WHEN p.oid IS NULL THEN 'MISSING'
              WHEN NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s LIKE 'search_path=%') THEN 'SEARCH_PATH NOT PINNED'
              WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'CALLABLE BY PUBLIC KEY'
              ELSE 'OK' END
  FROM functions f
  LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

  UNION ALL
  SELECT 7, 'column ml_interactions.userId',
         CASE WHEN format_type(a.atttypid, a.atttypmod) = 'text' THEN 'OK'
              ELSE 'IS ' || format_type(a.atttypid, a.atttypmod) || ' (signed-in telemetry fails)' END
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass('public.ml_interactions') AND a.attname = 'userId'

  UNION ALL
  SELECT 8, 'cron job ' || j.name,
         CASE WHEN s.names IS NULL THEN 'PG_CRON NOT ENABLED'
              WHEN j.name = ANY (s.names) THEN 'OK'
              ELSE 'NOT SCHEDULED' END
  FROM cron_jobs j CROSS JOIN scheduled s

  UNION ALL
  SELECT 9, 'unused table ' || t, 'STILL PRESENT'
  FROM unnest(ARRAY['Profile', 'UserKeywordProfile', 'UserCastProfile']) AS t
  WHERE to_regclass(format('public.%I', t)) IS NOT NULL
)
SELECT item, status
FROM checks
ORDER BY (status = 'OK'), sort, item;
