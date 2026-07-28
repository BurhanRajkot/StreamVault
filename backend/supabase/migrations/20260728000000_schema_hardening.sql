-- ============================================================
-- Schema hardening: missing columns, uniqueness, indexes,
-- PositionBiasLog retention, and the propensity aggregate RPC.
--
-- SAFE TO RUN ON PRODUCTION, and safe to run more than once.
--
-- Every block guards itself. Where a constraint cannot be added because the
-- table already holds violating rows, the block RAISEs a WARNING and skips
-- rather than aborting — so one dirty table cannot roll back the whole script.
-- Read the NOTICE/WARNING output in the Supabase SQL editor when it finishes:
-- anything reported as SKIPPED still needs your attention.
-- ============================================================


-- ============================================================
-- 1. Columns that may be missing on existing tables
--
-- The baseline migration's CREATE TABLE statements are skipped on a database
-- where these tables already exist, so any column added later has to be
-- backfilled explicitly here.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public."User"') IS NULL THEN
    RAISE WARNING 'SKIPPED: table public."User" not found.';
    RETURN;
  END IF;

  -- The download paywall reads this column, and admin approval writes it.
  -- If it is missing, every approval silently fails to grant access.
  ALTER TABLE public."User"
    ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive';
END $$;

DO $$
BEGIN
  IF to_regclass('public."Download"') IS NULL THEN
    RAISE WARNING 'SKIPPED: table public."Download" not found.';
    RETURN;
  END IF;

  -- Lets a catalogue row redirect to an external host instead of streaming
  -- from the `downloads` storage bucket.
  ALTER TABLE public."Download"
    ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
END $$;


-- ============================================================
-- 2. Uniqueness constraints
--
-- Three separate code paths use a check-then-insert pattern:
--   routes/subscriptions.ts  — SELECT by transaction_id, then INSERT
--   routes/favorites.ts      — SELECT by (userId, tmdbId, mediaType), then INSERT
--   routes/continueWatching.ts — same triple, then INSERT or UPDATE
--
-- None of them is protected by a constraint, so two concurrent requests both
-- pass the SELECT and both INSERT. For transaction_id that means one UPI
-- payment can produce two approved subscription requests. These constraints
-- make the database the arbiter instead of the race.
-- ============================================================

-- ── subscription_requests.transaction_id ─────────────────────
DO $$
DECLARE
  v_dupes BIGINT;
BEGIN
  IF to_regclass('public."subscription_requests"') IS NULL THEN
    RAISE WARNING 'SKIPPED: table subscription_requests not found.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."subscription_requests"'::regclass
      AND conname  = 'subscription_requests_transaction_id_key'
  ) THEN
    RAISE NOTICE 'OK: unique(transaction_id) already present.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT transaction_id
    FROM public."subscription_requests"
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING
      'SKIPPED unique(transaction_id): % duplicated value(s) already in the table. These are duplicate payment claims — review them, keep one row each, then re-run this migration.',
      v_dupes;
    RETURN;
  END IF;

  ALTER TABLE public."subscription_requests"
    ADD CONSTRAINT subscription_requests_transaction_id_key UNIQUE (transaction_id);
  RAISE NOTICE 'ADDED: unique(transaction_id).';
END $$;

-- ── Favorite (userId, tmdbId, mediaType) ─────────────────────
DO $$
DECLARE
  v_dupes BIGINT;
BEGIN
  IF to_regclass('public."Favorite"') IS NULL THEN
    RAISE WARNING 'SKIPPED: table "Favorite" not found.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."Favorite"'::regclass
      AND conname  = 'favorite_user_media_key'
  ) THEN
    RAISE NOTICE 'OK: unique(Favorite) already present.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT "userId", "tmdbId", "mediaType"
    FROM public."Favorite"
    GROUP BY "userId", "tmdbId", "mediaType"
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING
      'SKIPPED unique(Favorite): % duplicated (userId, tmdbId, mediaType) group(s). Deduplicate with the query in section 6, then re-run.',
      v_dupes;
    RETURN;
  END IF;

  ALTER TABLE public."Favorite"
    ADD CONSTRAINT favorite_user_media_key UNIQUE ("userId", "tmdbId", "mediaType");
  RAISE NOTICE 'ADDED: unique(Favorite).';
END $$;

-- ── ContinueWatching (userId, tmdbId, mediaType) ─────────────
DO $$
DECLARE
  v_dupes BIGINT;
BEGIN
  IF to_regclass('public."ContinueWatching"') IS NULL THEN
    RAISE WARNING 'SKIPPED: table "ContinueWatching" not found.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."ContinueWatching"'::regclass
      AND conname  = 'continue_watching_user_media_key'
  ) THEN
    RAISE NOTICE 'OK: unique(ContinueWatching) already present.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT "userId", "tmdbId", "mediaType"
    FROM public."ContinueWatching"
    GROUP BY "userId", "tmdbId", "mediaType"
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING
      'SKIPPED unique(ContinueWatching): % duplicated group(s). Deduplicate with the query in section 6, then re-run.',
      v_dupes;
    RETURN;
  END IF;

  ALTER TABLE public."ContinueWatching"
    ADD CONSTRAINT continue_watching_user_media_key UNIQUE ("userId", "tmdbId", "mediaType");
  RAISE NOTICE 'ADDED: unique(ContinueWatching).';
END $$;


-- ============================================================
-- 3. Indexes matching the queries the API actually issues
-- ============================================================

-- routes/admin.ts lists the queue ordered by created_at DESC.
CREATE INDEX IF NOT EXISTS idx_subscription_requests_created_at
  ON public."subscription_requests" ("created_at" DESC);

-- Filtering the queue down to pending requests.
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status
  ON public."subscription_requests" ("status");

-- Looking up a given account's requests.
CREATE INDEX IF NOT EXISTS idx_subscription_requests_user_id
  ON public."subscription_requests" ("user_id");

-- routes/downloads.ts orders the catalogue by createdAt DESC.
CREATE INDEX IF NOT EXISTS idx_download_created_at
  ON public."Download" ("createdAt" DESC);

-- routes/continueWatching.ts: WHERE userId = ? ORDER BY updatedAt DESC LIMIT 20.
CREATE INDEX IF NOT EXISTS idx_continue_watching_user_updated
  ON public."ContinueWatching" ("userId", "updatedAt" DESC);

-- routes/favorites.ts lists a user's favourites.
CREATE INDEX IF NOT EXISTS idx_favorite_user
  ON public."Favorite" ("userId");


-- ============================================================
-- 4. Propensity aggregate RPC
--
-- cinematch/ranking/positionBias.ts currently pulls raw impression rows:
--
--   .from('PositionBiasLog').select('displayPosition, clicked')
--                           .order('displayPosition', { ascending: true })
--
-- with no limit. PostgREST caps a response at db-max-rows (1000 by default),
-- so that query returns the 1000 LOWEST positions — in practice almost
-- entirely position 0. The function then normalises every CTR against
-- position 0, so the propensity table collapses to ~1.0 everywhere and the
-- IPS correction becomes a no-op. It also grows more wrong as the table grows.
--
-- Aggregating in SQL returns one row per distinct display position (a few
-- dozen at most), which is both correct and far cheaper than shipping every
-- impression row to the API process.
--
-- The 90-day window matches the retention job in section 5.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_position_bias_ctr(
  p_since INTERVAL DEFAULT '90 days'
)
RETURNS TABLE (
  "displayPosition" INTEGER,
  "impressions"     BIGINT,
  "clicks"          BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    "displayPosition",
    count(*)                             AS impressions,
    count(*) FILTER (WHERE clicked)      AS clicks
  FROM public."PositionBiasLog"
  WHERE "loggedAt" >= now() - p_since
  GROUP BY "displayPosition"
  ORDER BY "displayPosition";
$$;

-- Backend-only, matching the convention in 20260527000008_fix_rpc_security.sql.
REVOKE EXECUTE ON FUNCTION public.get_position_bias_ctr(INTERVAL) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_position_bias_ctr(INTERVAL) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_position_bias_ctr(INTERVAL) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_position_bias_ctr(INTERVAL) TO service_role;

-- Supports the windowed aggregate above.
CREATE INDEX IF NOT EXISTS idx_position_bias_logged_position
  ON public."PositionBiasLog" ("loggedAt", "displayPosition");


-- ============================================================
-- 5. PositionBiasLog retention
--
-- 20260302000000_position_bias_log.sql left the 90-day cleanup commented out
-- with a note to "run this as a pg_cron job". Nothing ever did. That was
-- harmless while no code read the table, but startWeightsRefreshLoop() now
-- runs hourly, so this table is both read regularly and growing unbounded.
--
-- Skips cleanly if pg_cron is not enabled on the project.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'SKIPPED retention job: pg_cron is not enabled. Enable it under Database > Extensions, then re-run this migration. Until then, prune manually with the DELETE in the comment below.';
    RETURN;
  END IF;

  -- cron.schedule upserts by job name, so re-running will not stack duplicates.
  PERFORM cron.schedule(
    'positionbiaslog-retention',
    '0 3 * * *',
    $cron$DELETE FROM public."PositionBiasLog" WHERE "loggedAt" < now() - interval '90 days'$cron$
  );
  RAISE NOTICE 'SCHEDULED: PositionBiasLog retention, daily at 03:00 UTC.';
END $$;

-- Manual equivalent, if you would rather not use pg_cron:
--   DELETE FROM public."PositionBiasLog" WHERE "loggedAt" < now() - interval '90 days';


-- ============================================================
-- 6. Deduplication helpers
--
-- Only needed if section 2 reported a SKIPPED constraint. Run the SELECT
-- first to see what would be removed; the DELETE keeps the newest row in
-- each group (for Favorite, the highest ctid, since id is not sortable).
-- ============================================================

-- Inspect duplicate transaction ids:
--   SELECT transaction_id, count(*), array_agg(id) AS request_ids
--   FROM public."subscription_requests"
--   GROUP BY transaction_id HAVING count(*) > 1;
--
-- Duplicate favourites — keep one row per group:
--   DELETE FROM public."Favorite" a
--   USING public."Favorite" b
--   WHERE a.ctid < b.ctid
--     AND a."userId" = b."userId"
--     AND a."tmdbId" = b."tmdbId"
--     AND a."mediaType" = b."mediaType";
--
-- Duplicate continue-watching rows — keep the most recently updated:
--   DELETE FROM public."ContinueWatching" a
--   USING public."ContinueWatching" b
--   WHERE a."userId" = b."userId"
--     AND a."tmdbId" = b."tmdbId"
--     AND a."mediaType" = b."mediaType"
--     AND (a."updatedAt", a.ctid) < (b."updatedAt", b.ctid);


-- ============================================================
-- 7. Verification
--
-- Run this afterwards and check the output. It reports the real, live column
-- types for the five baseline tables — send that back and the baseline
-- migration can be reconciled against it exactly.
-- ============================================================

-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('User', 'Favorite', 'ContinueWatching', 'Download', 'subscription_requests')
-- ORDER BY table_name, ordinal_position;
