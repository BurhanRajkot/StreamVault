-- ============================================================
-- Schema verification report
--
-- Not a migration — a read-only diagnostic. Paste into the Supabase SQL
-- editor and read the rows.
--
-- The SQL editor does not display RAISE NOTICE / RAISE WARNING output, so
-- the hardening migration's progress messages are invisible there. This
-- returns the same information as actual rows.
--
-- Every row should read OK. Anything else tells you exactly what to do next.
-- ============================================================

-- Runtime-evaluated lookups.
--
-- Postgres resolves every table reference when it PLANS a query, including
-- ones inside a CASE branch that never executes. So a plain reference to
-- cron.job makes this whole report fail with "relation cron.job does not
-- exist" on any project where pg_cron is not installed. query_to_xml() defers
-- the lookup to runtime, and the to_regclass() guard skips it entirely when
-- the relation is absent.
WITH dyn AS (
  SELECT
    d.label,
    CASE WHEN to_regclass(d.rel) IS NULL THEN NULL
         ELSE (xpath('/row/c/text()', query_to_xml(d.q, false, true, '')))[1]::text::bigint
    END AS n
  FROM (VALUES
    ('cron_job', 'cron.job',
     'SELECT count(*) AS c FROM cron.job WHERE jobname = ''positionbiaslog-retention'''),
    ('dup_txid', 'public.subscription_requests',
     'SELECT count(*) AS c FROM (SELECT 1 FROM public."subscription_requests" WHERE transaction_id IS NOT NULL GROUP BY transaction_id HAVING count(*) > 1) x'),
    ('dup_fav', 'public."Favorite"',
     'SELECT count(*) AS c FROM (SELECT 1 FROM public."Favorite" GROUP BY "userId","tmdbId","mediaType" HAVING count(*) > 1) x'),
    ('dup_cw', 'public."ContinueWatching"',
     'SELECT count(*) AS c FROM (SELECT 1 FROM public."ContinueWatching" GROUP BY "userId","tmdbId","mediaType" HAVING count(*) > 1) x')
  ) AS d(label, rel, q)
),
checks AS (

  -- ── Baseline tables ──────────────────────────────────────
  SELECT 1 AS sort, 'table: ' || t AS item,
         CASE WHEN to_regclass('public."' || t || '"') IS NOT NULL
              THEN 'OK' ELSE 'MISSING' END AS status,
         'run 20260101000000_baseline_core_tables.sql' AS fix
  FROM unnest(ARRAY['User','Favorite','ContinueWatching','Download','subscription_requests']) AS t

  -- ── Columns the application depends on ───────────────────
  UNION ALL
  SELECT 2, 'column: User.subscriptionStatus',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='User'
             AND column_name='subscriptionStatus'
         ) THEN 'OK' ELSE 'MISSING' END,
         'download paywall + admin approval both read this'

  UNION ALL
  SELECT 2, 'column: Download.externalUrl',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='Download'
             AND column_name='externalUrl'
         ) THEN 'OK' ELSE 'MISSING' END,
         'needed to redirect instead of streaming'

  -- ── Uniqueness constraints (the race-condition guards) ───
  UNION ALL
  SELECT 3, 'unique: ' || c.label,
         CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name)
              THEN 'OK' ELSE 'NOT APPLIED' END,
         'likely blocked by existing duplicates — see the duplicate rows below'
  FROM (VALUES
    ('subscription_requests_transaction_id_key', 'subscription_requests(transaction_id)'),
    ('favorite_user_media_key',                  'Favorite(userId,tmdbId,mediaType)'),
    ('continue_watching_user_media_key',         'ContinueWatching(userId,tmdbId,mediaType)')
  ) AS c(name, label)

  -- ── Indexes ──────────────────────────────────────────────
  UNION ALL
  SELECT 4, 'index: ' || i,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname = i
         ) THEN 'OK' ELSE 'MISSING' END,
         'run 20260728000000_schema_hardening.sql'
  FROM unnest(ARRAY[
    'idx_subscription_requests_created_at',
    'idx_subscription_requests_status',
    'idx_subscription_requests_user_id',
    'idx_download_created_at',
    'idx_continue_watching_user_updated',
    'idx_favorite_user',
    'idx_position_bias_logged_position'
  ]) AS i

  -- ── Propensity RPC ───────────────────────────────────────
  UNION ALL
  SELECT 5, 'function: get_position_bias_ctr',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='get_position_bias_ctr'
         ) THEN 'OK' ELSE 'MISSING' END,
         'still unused until positionBias.ts calls it'

  -- ── Retention job ────────────────────────────────────────
  UNION ALL
  SELECT 6, 'extension: pg_cron',
         CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
              THEN 'OK' ELSE 'NOT ENABLED' END,
         'Dashboard > Database > Extensions, then re-run the hardening file'

  UNION ALL
  SELECT 6, 'cron job: positionbiaslog-retention',
         CASE WHEN n IS NULL THEN 'N/A (pg_cron off)'
              WHEN n > 0    THEN 'OK'
              ELSE 'NOT SCHEDULED' END,
         'PositionBiasLog grows unbounded without it'
  FROM dyn WHERE label = 'cron_job'

  -- ── RLS coverage ─────────────────────────────────────────
  UNION ALL
  SELECT 7, 'RLS enabled: ' || c.relname,
         CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'DISABLED' END,
         'table is exposed through PostgREST without it'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('User','Favorite','ContinueWatching','Download',
                      'subscription_requests','UserInteractions','UserGenreProfile',
                      'UserKeywordProfile','UserCastProfile','RecommendationCache',
                      'PositionBiasLog')

  -- ── Remaining duplicates blocking the constraints ────────
  UNION ALL
  SELECT 8,
         'duplicates: ' || CASE label
                             WHEN 'dup_txid' THEN 'subscription_requests.transaction_id'
                             WHEN 'dup_fav'  THEN 'Favorite'
                             ELSE 'ContinueWatching'
                           END,
         CASE WHEN n IS NULL THEN 'N/A (table missing)'
              WHEN n = 0     THEN 'OK'
              ELSE n::text || ' GROUP(S)' END,
         'clean these up, then re-run the hardening file'
  FROM dyn WHERE label IN ('dup_txid','dup_fav','dup_cw')
)
SELECT
  item,
  status,
  CASE WHEN status = 'OK' THEN '' ELSE fix END AS next_step
FROM checks
ORDER BY (status = 'OK'), sort, item;
