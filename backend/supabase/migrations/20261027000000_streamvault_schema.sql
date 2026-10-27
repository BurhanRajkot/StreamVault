-- =============================================================================
-- StreamVault — database schema
-- =============================================================================
--
-- The whole schema in one file. It replaces the twenty migrations that came
-- before it, and it is written to converge: on an empty Supabase project it
-- builds the database the backend expects, and on the existing production
-- project it reconciles whatever is there to the same end state.
--
-- HOW TO APPLY
--   Supabase Dashboard → SQL Editor → paste this file → Run.
--   (psql: psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f <file>)
--
--   It runs as one transaction: it applies completely or not at all. It ends
--   by verifying its own result (and rolls back if anything is off), then
--   prints a one-row-per-table summary. Re-running it changes nothing.
--
-- SECURITY MODEL
--   Browsers never talk to Postgres. Every query comes from the backend with
--   the service_role key, which bypasses RLS. So every table has RLS enabled
--   with no policies, and anon/authenticated hold no privileges: the public
--   PostgREST and GraphQL endpoints expose nothing. Users are identified by
--   their Auth0 subject ("google-oauth2|…"), not Supabase Auth — which is why
--   nothing here uses auth.uid().
--
-- WHAT IT FIXES ON THE EXISTING PROJECT (audited against live data 2026-10-27)
--   * ml_interactions."userId" was uuid REFERENCES auth.users, so every
--     signed-in telemetry insert failed; it becomes text, and the history is
--     rebuilt from UserInteractions.
--   * Adds the NOT NULLs, CHECKs, UNIQUEs and foreign keys the data has always
--     obeyed but nothing enforced. Deleting a User now cascades to their data;
--     payment records are kept with user_id set to NULL.
--   * Replaces RLS policies that could never match (auth.uid() against Auth0
--     ids) with deny-by-default, and revokes the anon/authenticated grants.
--   * Subscription approval becomes one atomic call
--     (approve_subscription_request), and lapsed subscriptions are marked
--     expired.
--   * Drops what nothing uses: Profile, UserKeywordProfile, UserCastProfile
--     (only while empty), get_user_profile_data(), and redundant indexes.
--   * Schedules retention and expiry jobs with pg_cron.
--
--   Deliberately untouched: watch_sessions, the watch_status type and
--   join_by_code(). Nothing in this codebase uses them.
-- =============================================================================

SET lock_timeout = '10s';


-- -----------------------------------------------------------------------------
-- Migration-local helpers
--
-- Created in pg_temp, so they are private to this session and disappear
-- with it.
-- -----------------------------------------------------------------------------

-- Every table this file owns.
CREATE OR REPLACE FUNCTION pg_temp.sv_tables()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'User', 'Favorite', 'ContinueWatching', 'Download', 'subscription_requests',
    'UserInteractions', 'UserGenreProfile', 'RecommendationCache',
    'PositionBiasLog', 'ml_interactions', 'movie_embeddings'
  ]
$$;

-- Changes a column's type when, and only when, it differs from p_type
-- (written the way format_type() prints it). Foreign keys on the column are
-- dropped first; sv_constraints re-adds the ones that belong.
CREATE OR REPLACE FUNCTION pg_temp.sv_set_type(p_table regclass, p_column name, p_type text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current text;
  v_fk      name;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_current
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped;

  IF v_current = p_type THEN
    RETURN;
  END IF;

  FOR v_fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = p_table AND c.contype = 'f' AND a.attname = p_column
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, v_fk);
  END LOOP;

  EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE %s USING %I::%s',
                 p_table, p_column, p_type, p_column, p_type);
  RAISE NOTICE '%.%: % -> %', p_table, p_column, v_current, p_type;
END;
$$;

-- Makes a table's CHECK, UNIQUE and FOREIGN KEY constraints exactly the given
-- {name, definition} pairs: anything else is dropped (the unnamed constraints
-- of the hand-made tables), anything missing is added. Primary keys and NOT
-- NULLs are left alone.
CREATE OR REPLACE FUNCTION pg_temp.sv_constraints(p_table regclass, p_constraints text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_wanted text[] := ARRAY(
    SELECT p_constraints[i][1] FROM generate_subscripts(p_constraints, 1) AS i
  );
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = p_table AND contype IN ('c', 'f', 'u') AND conname <> ALL (v_wanted)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, v_name);
    RAISE NOTICE '%: dropped constraint %', p_table, v_name;
  END LOOP;

  FOR i IN 1 .. array_length(p_constraints, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = p_table AND conname = p_constraints[i][1]
    ) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                     p_table, p_constraints[i][1], p_constraints[i][2]);
      RAISE NOTICE '%: added constraint %', p_table, p_constraints[i][1];
    END IF;
  END LOOP;
END;
$$;

-- Drops a table nothing uses, but only while it is empty. A table with rows
-- is reported and left for a human to look at.
CREATE OR REPLACE FUNCTION pg_temp.sv_drop_if_empty(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rel      regclass := to_regclass(p_table);
  v_has_rows boolean;
BEGIN
  IF v_rel IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', v_rel) INTO v_has_rows;
  IF v_has_rows THEN
    RAISE WARNING '% is unused but not empty, so it was left in place. Check its rows, then drop it by hand.', v_rel;
  ELSE
    EXECUTE format('DROP TABLE %s', v_rel);
    RAISE NOTICE 'dropped unused table %', p_table;
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- Preflight
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_table     text;
  v_rel       regclass;
  v_not_owned text[] := '{}';
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL 14 or newer is required (found %).', current_setting('server_version');
  END IF;

  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) < 3 THEN
    RAISE EXCEPTION 'The Supabase roles anon, authenticated and service_role are missing. This migration targets a Supabase project.';
  END IF;

  FOREACH v_table IN ARRAY pg_temp.sv_tables() || ARRAY['Profile', 'UserKeywordProfile', 'UserCastProfile'] LOOP
    v_rel := to_regclass(format('public.%I', v_table));
    IF v_rel IS NOT NULL
       AND NOT pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = v_rel), 'USAGE') THEN
      v_not_owned := v_not_owned || v_table;
    END IF;
  END LOOP;

  IF cardinality(v_not_owned) > 0 THEN
    RAISE EXCEPTION 'Run this as the role that owns the tables (normally postgres). % cannot alter: %',
      current_user, array_to_string(v_not_owned, ', ');
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS extensions;

-- pgvector belongs in the extensions schema, not public.
DO $$
DECLARE
  v_schema name;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';

  IF v_schema IS NULL THEN
    CREATE EXTENSION vector WITH SCHEMA extensions;
  ELSIF v_schema <> 'extensions' THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- Retire what nothing uses
-- -----------------------------------------------------------------------------

-- Every existing policy goes. The owner_all policies compared auth.uid() — a
-- Supabase Auth uuid — with Auth0 ids, so they could never match anything;
-- the service_role_bypass ones were no-ops because service_role has
-- BYPASSRLS. Access is now deny-by-default (see Security below).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (pg_temp.sv_tables())
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

-- Superseded RPC; the backend builds profiles itself.
DROP FUNCTION IF EXISTS public.get_user_profile_data(text);

-- Profile is a leftover from an earlier ORM. Keyword and cast affinities live
-- in UserGenreProfile."genreMap"->'_meta', so their own tables were never
-- written to.
SELECT pg_temp.sv_drop_if_empty('public."Profile"');
SELECT pg_temp.sv_drop_if_empty('public."UserKeywordProfile"');
SELECT pg_temp.sv_drop_if_empty('public."UserCastProfile"');


-- -----------------------------------------------------------------------------
-- Trigger functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'BEFORE UPDATE trigger: stamps "updatedAt".';

-- Users exist in Auth0, not in this database; a User row is just the anchor
-- that user-owned rows reference. Creating it here, on the first write that
-- needs it, means no insert can ever fail on the foreign key — whichever code
-- path gets there first. The argument names the user column.
CREATE OR REPLACE FUNCTION public.ensure_user_exists()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF TG_ARGV[0] = 'user_id' THEN
    v_user_id := NEW.user_id;
  ELSE
    v_user_id := NEW."userId";
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public."User" ("id") VALUES (v_user_id) ON CONFLICT ("id") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_user_exists() IS
  'BEFORE INSERT trigger: creates the referenced User row if it does not exist yet. TG_ARGV[0] is the user column ("userId" or user_id).';

CREATE OR REPLACE FUNCTION public.stamp_subscription_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_at := CASE WHEN NEW.status = 'pending' THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_subscription_review() IS
  'BEFORE UPDATE trigger: records when a subscription request left (or returned to) pending.';


-- =============================================================================
-- Tables
--
-- Each table is: the canonical CREATE TABLE (a no-op where the table exists),
-- then the ALTERs that bring the existing production table in line, then its
-- complete constraint set.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- User
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."User" (
  "id"                    text        PRIMARY KEY,
  "subscriptionStatus"    text        NOT NULL DEFAULT 'free',
  "subscriptionExpiresAt" timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedAt"             timestamptz NOT NULL DEFAULT now();

-- Earlier migrations defaulted to 'inactive'; production defaults to 'free'.
UPDATE public."User"
SET "subscriptionStatus" = 'free'
WHERE "subscriptionStatus" IS NULL OR "subscriptionStatus" = 'inactive';

UPDATE public."User"
SET "subscriptionStatus" = 'expired'
WHERE "subscriptionStatus" = 'active' AND "subscriptionExpiresAt" < now();

ALTER TABLE public."User"
  ALTER COLUMN "subscriptionStatus" SET DEFAULT 'free',
  ALTER COLUMN "subscriptionStatus" SET NOT NULL,
  ALTER COLUMN "createdAt"          SET DEFAULT now(),
  ALTER COLUMN "createdAt"          SET NOT NULL;

SELECT pg_temp.sv_constraints('public."User"', ARRAY[
  ['user_id_check',                  $c$CHECK (char_length("id") BETWEEN 1 AND 255)$c$],
  ['user_subscription_status_check', $c$CHECK ("subscriptionStatus" IN ('free', 'active', 'expired'))$c$]
]);

COMMENT ON TABLE public."User" IS
  'One row per account. Created on first use, by the API or by ensure_user_exists().';
COMMENT ON COLUMN public."User"."id" IS
  'Auth0 subject, e.g. "google-oauth2|1234".';
COMMENT ON COLUMN public."User"."subscriptionStatus" IS
  'free | active | expired. Paid access means active and not past subscriptionExpiresAt. An hourly job moves lapsed active rows to expired.';
COMMENT ON COLUMN public."User"."subscriptionExpiresAt" IS
  'End of the paid period. NULL on an active row is a lifetime grant.';


-- -----------------------------------------------------------------------------
-- Favorite
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."Favorite" (
  "id"        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    text        NOT NULL,
  "tmdbId"    integer     NOT NULL,
  "mediaType" text        NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."Favorite"
  ALTER COLUMN "userId"    SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "createdAt" SET NOT NULL;

SELECT pg_temp.sv_constraints('public."Favorite"', ARRAY[
  ['favorite_user_fkey',        $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['favorite_tmdb_id_check',    $c$CHECK ("tmdbId" > 0)$c$],
  ['favorite_media_type_check', $c$CHECK ("mediaType" IN ('movie', 'tv'))$c$],
  ['favorite_user_media_key',   $c$UNIQUE ("userId", "tmdbId", "mediaType")$c$]
]);

COMMENT ON TABLE public."Favorite" IS
  'Titles a user saved to My List.';


-- -----------------------------------------------------------------------------
-- ContinueWatching
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."ContinueWatching" (
  "id"        uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    text             NOT NULL,
  "tmdbId"    integer          NOT NULL,
  "mediaType" text             NOT NULL,
  "season"    integer,
  "episode"   integer,
  "progress"  double precision NOT NULL DEFAULT 0,
  "server"    text,
  "createdAt" timestamptz      NOT NULL DEFAULT now(),
  "updatedAt" timestamptz      NOT NULL DEFAULT now()
);

-- The production table never had createdAt. updatedAt is the closest record
-- of when each row started.
ALTER TABLE public."ContinueWatching"
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz;

UPDATE public."ContinueWatching"
SET "createdAt" = COALESCE("updatedAt", now())
WHERE "createdAt" IS NULL;

ALTER TABLE public."ContinueWatching"
  ALTER COLUMN "userId"    SET NOT NULL,
  ALTER COLUMN "progress"  SET DEFAULT 0,
  ALTER COLUMN "progress"  SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- Ranges mirror the validation in routes/continueWatching.ts.
SELECT pg_temp.sv_constraints('public."ContinueWatching"', ARRAY[
  ['continue_watching_user_fkey',        $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['continue_watching_tmdb_id_check',    $c$CHECK ("tmdbId" > 0)$c$],
  ['continue_watching_media_type_check', $c$CHECK ("mediaType" IN ('movie', 'tv'))$c$],
  ['continue_watching_season_check',     $c$CHECK ("season" BETWEEN 1 AND 1000)$c$],
  ['continue_watching_episode_check',    $c$CHECK ("episode" BETWEEN 1 AND 10000)$c$],
  ['continue_watching_progress_check',   $c$CHECK ("progress" BETWEEN 0 AND 1)$c$],
  ['continue_watching_server_check',     $c$CHECK ("server" ~ '^[a-z0-9_]{1,50}$')$c$],
  ['continue_watching_user_media_key',   $c$UNIQUE ("userId", "tmdbId", "mediaType")$c$]
]);

COMMENT ON TABLE public."ContinueWatching" IS
  'Playback position per user and title: one row per (userId, tmdbId, mediaType).';
COMMENT ON COLUMN public."ContinueWatching"."progress" IS
  'Fraction watched, 0..1.';
COMMENT ON COLUMN public."ContinueWatching"."server" IS
  'Provider key the user last played from, e.g. vidfast_pro or debrid.';


-- -----------------------------------------------------------------------------
-- Download
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."Download" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"       text        NOT NULL,
  "quality"     text,
  "filename"    text        NOT NULL,
  "externalUrl" text,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."Download"
  ADD COLUMN IF NOT EXISTS "externalUrl" text;

ALTER TABLE public."Download"
  ALTER COLUMN "title"     SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "createdAt" SET NOT NULL;

-- The filename rule is what sanitizeFilename() in routes/downloads.ts lets
-- through, so the stored name is always the name the route asks storage for.
SELECT pg_temp.sv_constraints('public."Download"', ARRAY[
  ['download_title_check',        $c$CHECK (btrim("title") <> '')$c$],
  ['download_filename_check',     $c$CHECK ("filename" ~ '^[A-Za-z0-9._-]+$')$c$],
  ['download_external_url_check', $c$CHECK ("externalUrl" ~ '^https://')$c$],
  ['download_filename_key',       $c$UNIQUE ("filename")$c$]
]);

COMMENT ON TABLE public."Download" IS
  'Premium download catalogue. Files are served from the downloads storage bucket, or by redirect when externalUrl is set.';


-- -----------------------------------------------------------------------------
-- subscription_requests
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."subscription_requests" (
  "id"             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        text,
  "email"          text,
  "plan_id"        text          NOT NULL,
  "amount"         numeric(10,2) NOT NULL,
  "currency"       text          NOT NULL DEFAULT 'INR',
  "transaction_id" text          NOT NULL,
  "status"         text          NOT NULL DEFAULT 'pending',
  "created_at"     timestamptz   NOT NULL DEFAULT now(),
  "reviewed_at"    timestamptz
);

ALTER TABLE public."subscription_requests"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;

SELECT pg_temp.sv_set_type('public."subscription_requests"', 'amount', 'numeric(10,2)');

ALTER TABLE public."subscription_requests"
  ALTER COLUMN "plan_id"        SET NOT NULL,
  ALTER COLUMN "amount"         SET NOT NULL,
  ALTER COLUMN "currency"       SET DEFAULT 'INR',
  ALTER COLUMN "currency"       SET NOT NULL,
  ALTER COLUMN "transaction_id" SET NOT NULL,
  ALTER COLUMN "status"         SET DEFAULT 'pending',
  ALTER COLUMN "status"         SET NOT NULL,
  ALTER COLUMN "created_at"     SET DEFAULT now(),
  ALTER COLUMN "created_at"     SET NOT NULL;

-- A payment record outlives the account that made it, hence SET NULL.
-- The transaction id rule matches the sanitising in routes/subscriptions.ts.
SELECT pg_temp.sv_constraints('public."subscription_requests"', ARRAY[
  ['subscription_requests_user_fkey',            $c$FOREIGN KEY ("user_id") REFERENCES public."User" ("id") ON DELETE SET NULL$c$],
  ['subscription_requests_email_check',          $c$CHECK (char_length("email") <= 254)$c$],
  ['subscription_requests_plan_id_check',        $c$CHECK ("plan_id" ~ '^[a-z0-9_]{1,32}$')$c$],
  ['subscription_requests_amount_check',         $c$CHECK ("amount" > 0)$c$],
  ['subscription_requests_currency_check',       $c$CHECK ("currency" ~ '^[A-Z]{3}$')$c$],
  ['subscription_requests_transaction_id_check', $c$CHECK ("transaction_id" ~ '^[A-Za-z0-9_-]{4,100}$')$c$],
  ['subscription_requests_status_check',         $c$CHECK ("status" IN ('pending', 'approved', 'rejected'))$c$],
  ['subscription_requests_transaction_id_key',   $c$UNIQUE ("transaction_id")$c$]
]);

COMMENT ON TABLE public."subscription_requests" IS
  'Manual UPI payment claims awaiting admin review. Approve with approve_subscription_request().';
COMMENT ON COLUMN public."subscription_requests"."user_id" IS
  'Submitting account; NULL for guest submissions and for accounts deleted since.';
COMMENT ON COLUMN public."subscription_requests"."transaction_id" IS
  'UPI reference. Unique, so one payment can only ever be claimed once.';
COMMENT ON COLUMN public."subscription_requests"."reviewed_at" IS
  'When the request was approved or rejected. Maintained by trigger.';


-- -----------------------------------------------------------------------------
-- UserInteractions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."UserInteractions" (
  "id"        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    text         NOT NULL,
  "tmdbId"    integer      NOT NULL,
  "mediaType" text         NOT NULL,
  "eventType" text         NOT NULL,
  "weight"    numeric(4,3) NOT NULL DEFAULT 1.0,
  "progress"  numeric(4,3),
  "rating"    smallint,
  "createdAt" timestamptz  NOT NULL DEFAULT now()
);

SELECT pg_temp.sv_set_type('public."UserInteractions"', 'weight',   'numeric(4,3)');
SELECT pg_temp.sv_set_type('public."UserInteractions"', 'progress', 'numeric(4,3)');

SELECT pg_temp.sv_constraints('public."UserInteractions"', ARRAY[
  ['user_interactions_user_fkey',        $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['user_interactions_tmdb_id_check',    $c$CHECK ("tmdbId" > 0)$c$],
  ['user_interactions_media_type_check', $c$CHECK ("mediaType" IN ('movie', 'tv'))$c$],
  ['user_interactions_event_type_check', $c$CHECK ("eventType" IN ('watch', 'favorite', 'click', 'search', 'rate', 'dislike'))$c$],
  ['user_interactions_weight_check',     $c$CHECK ("weight" BETWEEN -1 AND 1)$c$],
  ['user_interactions_progress_check',   $c$CHECK ("progress" BETWEEN 0 AND 1)$c$],
  ['user_interactions_rating_check',     $c$CHECK ("rating" BETWEEN 1 AND 5)$c$]
]);

COMMENT ON TABLE public."UserInteractions" IS
  'CineMatch event log: every watch, favorite, click, search, rating and dislike. Append-only; a dislike is undone by deleting its rows.';
COMMENT ON COLUMN public."UserInteractions"."weight" IS
  'Signal strength in [-1, 1], computed in cinematch/tracking/events.ts.';


-- -----------------------------------------------------------------------------
-- UserGenreProfile
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."UserGenreProfile" (
  "userId"    text        PRIMARY KEY,
  "genreMap"  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."UserGenreProfile"
  ALTER COLUMN "genreMap" SET DEFAULT '{}'::jsonb;

SELECT pg_temp.sv_constraints('public."UserGenreProfile"', ARRAY[
  ['user_genre_profile_user_fkey',      $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['user_genre_profile_genre_map_check', $c$CHECK (jsonb_typeof("genreMap") = 'object')$c$]
]);

COMMENT ON TABLE public."UserGenreProfile" IS
  'Persisted CineMatch taste profile, blended on every strong interaction.';
COMMENT ON COLUMN public."UserGenreProfile"."genreMap" IS
  'TMDB genre id -> affinity in [-1, 1], plus "_meta": {keywordMap, castMap, directorMap, decadeMap} written at onboarding.';


-- -----------------------------------------------------------------------------
-- RecommendationCache
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."RecommendationCache" (
  "userId"          text        PRIMARY KEY,
  "recommendations" jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "computedAt"      timestamptz NOT NULL DEFAULT now(),
  "ttlSeconds"      integer     NOT NULL DEFAULT 300
);

ALTER TABLE public."RecommendationCache"
  ALTER COLUMN "recommendations" SET DEFAULT '[]'::jsonb;

SELECT pg_temp.sv_constraints('public."RecommendationCache"', ARRAY[
  ['recommendation_cache_user_fkey',             $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['recommendation_cache_recommendations_check', $c$CHECK (jsonb_typeof("recommendations") = 'array')$c$],
  ['recommendation_cache_ttl_seconds_check',     $c$CHECK ("ttlSeconds" >= 0)$c$]
]);

COMMENT ON TABLE public."RecommendationCache" IS
  'Last computed home feed per user, served stale-while-revalidate (cinematch/mixer/homeTimeline.ts).';
COMMENT ON COLUMN public."RecommendationCache"."ttlSeconds" IS
  'Fresh for this long after computedAt. 0 marks the row stale: it is still served once while a rebuild runs.';


-- -----------------------------------------------------------------------------
-- PositionBiasLog
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."PositionBiasLog" (
  "id"              bigserial   PRIMARY KEY,
  "userId"          text        NOT NULL,
  "tmdbId"          integer     NOT NULL,
  "mediaType"       text        NOT NULL,
  "displayPosition" integer     NOT NULL,
  "clicked"         boolean     NOT NULL DEFAULT false,
  "source"          text,
  "loggedAt"        timestamptz NOT NULL DEFAULT now()
);

SELECT pg_temp.sv_constraints('public."PositionBiasLog"', ARRAY[
  ['position_bias_log_user_fkey',             $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['position_bias_log_tmdb_id_check',         $c$CHECK ("tmdbId" > 0)$c$],
  ['position_bias_log_media_type_check',      $c$CHECK ("mediaType" IN ('movie', 'tv'))$c$],
  ['position_bias_log_display_position_check', $c$CHECK ("displayPosition" >= 0)$c$],
  ['position_bias_log_source_check',          $c$CHECK (char_length("source") <= 64)$c$]
]);

COMMENT ON TABLE public."PositionBiasLog" IS
  'Impressions for inverse-propensity scoring (cinematch/ranking/positionBias.ts). Kept for 90 days.';
COMMENT ON COLUMN public."PositionBiasLog"."displayPosition" IS
  '0-based slot the title was shown in.';


-- -----------------------------------------------------------------------------
-- ml_interactions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."ml_interactions" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"           text,
  "sessionId"        text,
  "tmdbId"           integer     NOT NULL,
  "mediaType"        text,
  "interactionType"  text        NOT NULL,
  "label"            real        NOT NULL,
  "playbackProgress" real,
  "selectedServer"   text,
  "deviceType"       text,
  "os"               text,
  "browser"          text,
  "browserLanguage"  text,
  "networkType"      text,
  "country"          text,
  "timezone"         text,
  "localHour"        smallint,
  "timestamp"        timestamptz NOT NULL DEFAULT now()
);

-- "userId" was uuid REFERENCES auth.users. Account ids are Auth0 subjects,
-- so every signed-in insert failed the cast; only guest rows ever landed.
SELECT pg_temp.sv_set_type('public."ml_interactions"', 'userId', 'text');

ALTER TABLE public."ml_interactions"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- The context columns arrive from the browser, so their length is capped.
SELECT pg_temp.sv_constraints('public."ml_interactions"', ARRAY[
  ['ml_interactions_user_fkey',               $c$FOREIGN KEY ("userId") REFERENCES public."User" ("id") ON DELETE CASCADE$c$],
  ['ml_interactions_actor_check',             $c$CHECK ("userId" IS NOT NULL OR "sessionId" IS NOT NULL)$c$],
  ['ml_interactions_tmdb_id_check',           $c$CHECK ("tmdbId" > 0)$c$],
  ['ml_interactions_media_type_check',        $c$CHECK ("mediaType" IN ('movie', 'tv'))$c$],
  ['ml_interactions_interaction_type_check',  $c$CHECK ("interactionType" IN ('watch', 'favorite', 'click', 'search', 'rate', 'dislike'))$c$],
  ['ml_interactions_label_check',             $c$CHECK ("label" BETWEEN 0 AND 1)$c$],
  ['ml_interactions_playback_progress_check', $c$CHECK ("playbackProgress" BETWEEN 0 AND 1)$c$],
  ['ml_interactions_local_hour_check',        $c$CHECK ("localHour" BETWEEN 0 AND 23)$c$],
  ['ml_interactions_context_length_check',    $c$CHECK (
        char_length("sessionId")       <= 100
    AND char_length("selectedServer")  <= 100
    AND char_length("deviceType")      <= 100
    AND char_length("os")              <= 100
    AND char_length("browser")         <= 100
    AND char_length("browserLanguage") <= 100
    AND char_length("networkType")     <= 100
    AND char_length("country")         <= 100
    AND char_length("timezone")        <= 100
  )$c$]
]);

COMMENT ON TABLE public."ml_interactions" IS
  'Training rows for the two-tower model (backend/ml-pipeline): signed-in events keyed by userId, guest events by sessionId.';
COMMENT ON COLUMN public."ml_interactions"."label" IS
  'Training target in [0, 1], derived from the interaction weight in cinematch/ml/telemetry.ts.';


-- -----------------------------------------------------------------------------
-- movie_embeddings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."movie_embeddings" (
  "tmdbId"    integer               PRIMARY KEY,
  "embedding" extensions.vector(64) NOT NULL,
  "updatedAt" timestamptz           NOT NULL DEFAULT now()
);

SELECT pg_temp.sv_constraints('public."movie_embeddings"', ARRAY[
  ['movie_embeddings_tmdb_id_check', $c$CHECK ("tmdbId" > 0)$c$]
]);

COMMENT ON TABLE public."movie_embeddings" IS
  'Item-tower vectors uploaded by backend/ml-pipeline/upload_embeddings.py. Searched with match_movies_from_user_embedding().';


-- =============================================================================
-- Indexes
--
-- Each one serves a query the backend actually issues, or a foreign key (so
-- deleting a User does not scan the child table). Unique constraints above
-- bring their own indexes.
-- =============================================================================

-- Superseded or redundant: covered by a unique constraint or by a composite
-- index below, or serving a query that no longer exists.
DROP INDEX IF EXISTS public."idx_favorite_user";
DROP INDEX IF EXISTS public."idx_subscription_requests_status";
DROP INDEX IF EXISTS public."idx_interactions_user_id";
DROP INDEX IF EXISTS public."idx_interactions_tmdb";
DROP INDEX IF EXISTS public."idx_position_bias_position";
DROP INDEX IF EXISTS public."idx_position_bias_position_clicked";
DROP INDEX IF EXISTS public."idx_position_bias_logged_at";
DROP INDEX IF EXISTS public."idx_position_bias_logged_position";
DROP INDEX IF EXISTS public."ml_interactions_session_id_idx";

-- The hourly expiry job.
CREATE INDEX IF NOT EXISTS "idx_user_active_expiry"
  ON public."User" ("subscriptionExpiresAt")
  WHERE "subscriptionStatus" = 'active';

-- GET /favorites, newest first.
CREATE INDEX IF NOT EXISTS "idx_favorite_user_created"
  ON public."Favorite" ("userId", "createdAt" DESC);

-- GET /continue-watching: WHERE userId ORDER BY updatedAt DESC LIMIT 20.
CREATE INDEX IF NOT EXISTS "idx_continue_watching_user_updated"
  ON public."ContinueWatching" ("userId", "updatedAt" DESC);

-- GET /downloads, newest first.
CREATE INDEX IF NOT EXISTS "idx_download_created_at"
  ON public."Download" ("createdAt" DESC);

-- Admin queue, newest first.
CREATE INDEX IF NOT EXISTS "idx_subscription_requests_created_at"
  ON public."subscription_requests" ("created_at" DESC);

-- A user's requests, and the user foreign key.
CREATE INDEX IF NOT EXISTS "idx_subscription_requests_user_id"
  ON public."subscription_requests" ("user_id");

-- The new-member offer is redeemable once: at most one live intro request per
-- account. The route checks this too; this closes the race between two tabs.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscription_requests_one_intro"
  ON public."subscription_requests" ("user_id")
  WHERE "plan_id" = 'intro' AND "status" IN ('pending', 'approved');

-- Profile hydration, dislikes, taste-profile stats, history reset — all
-- "this user's events, newest first". Also the user foreign key.
CREATE INDEX IF NOT EXISTS "idx_interactions_user_created"
  ON public."UserInteractions" ("userId", "createdAt" DESC);

-- Collaborative filtering: peers' strong, recent interactions.
CREATE INDEX IF NOT EXISTS "idx_interactions_peer_lookup"
  ON public."UserInteractions" ("userId", "weight", "createdAt" DESC);

-- The user foreign key.
CREATE INDEX IF NOT EXISTS "idx_position_bias_user"
  ON public."PositionBiasLog" ("userId");

-- get_position_bias_ctr() and the retention job scan by time; the INCLUDE
-- columns let the aggregate run as an index-only scan.
CREATE INDEX IF NOT EXISTS "idx_position_bias_window"
  ON public."PositionBiasLog" ("loggedAt") INCLUDE ("displayPosition", "clicked");

-- The user foreign key; time-ordered training exports.
CREATE INDEX IF NOT EXISTS "ml_interactions_user_id_idx"
  ON public."ml_interactions" ("userId");
CREATE INDEX IF NOT EXISTS "ml_interactions_timestamp_idx"
  ON public."ml_interactions" ("timestamp");

-- Approximate nearest-neighbour search by inner product, which is what the
-- two-tower model scores with.
CREATE INDEX IF NOT EXISTS "movie_embeddings_embedding_idx"
  ON public."movie_embeddings" USING hnsw ("embedding" extensions.vector_ip_ops);


-- =============================================================================
-- Triggers
-- =============================================================================

CREATE OR REPLACE TRIGGER "set_updated_at"
  BEFORE UPDATE ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER "set_updated_at"
  BEFORE UPDATE ON public."ContinueWatching"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER "set_updated_at"
  BEFORE UPDATE ON public."UserGenreProfile"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER "set_updated_at"
  BEFORE UPDATE ON public."movie_embeddings"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."Favorite"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."ContinueWatching"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."UserInteractions"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."UserGenreProfile"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."RecommendationCache"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."PositionBiasLog"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."ml_interactions"
  FOR EACH ROW WHEN (NEW."userId" IS NOT NULL)
  EXECUTE FUNCTION public.ensure_user_exists('userId');

CREATE OR REPLACE TRIGGER "ensure_user_exists"
  BEFORE INSERT ON public."subscription_requests"
  FOR EACH ROW WHEN (NEW."user_id" IS NOT NULL)
  EXECUTE FUNCTION public.ensure_user_exists('user_id');

CREATE OR REPLACE TRIGGER "stamp_review"
  BEFORE UPDATE OF "status" ON public."subscription_requests"
  FOR EACH ROW EXECUTE FUNCTION public.stamp_subscription_review();


-- =============================================================================
-- RPC functions
--
-- All SECURITY INVOKER with an empty search_path (every name is qualified),
-- and executable by service_role only.
-- =============================================================================

-- Nearest movies to a user vector by inner product. Takes the closest
-- match_count (capped at 200) via the HNSW index, then drops anything below
-- match_threshold.
CREATE OR REPLACE FUNCTION public.match_movies_from_user_embedding(
  query_embedding extensions.vector,
  match_threshold double precision,
  match_count     integer
)
RETURNS TABLE ("tmdbId" integer, "similarity" double precision)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nearest."tmdbId", nearest."similarity"
  FROM (
    SELECT me."tmdbId",
           -(me."embedding" OPERATOR(extensions.<#>) query_embedding) AS "similarity"
    FROM public."movie_embeddings" me
    ORDER BY me."embedding" OPERATOR(extensions.<#>) query_embedding
    LIMIT least(greatest(match_count, 0), 200)
  ) AS nearest
  WHERE nearest."similarity" >= match_threshold
  ORDER BY nearest."similarity" DESC;
$$;

-- Impressions and clicks per display position over a trailing window: one
-- row per position, for the propensity table in positionBias.ts.
CREATE OR REPLACE FUNCTION public.get_position_bias_ctr(p_since interval DEFAULT '90 days')
RETURNS TABLE ("displayPosition" integer, "impressions" bigint, "clicks" bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pbl."displayPosition",
         count(*),
         count(*) FILTER (WHERE pbl."clicked")
  FROM public."PositionBiasLog" pbl
  WHERE pbl."loggedAt" >= now() - p_since
  GROUP BY pbl."displayPosition"
  ORDER BY pbl."displayPosition";
$$;

-- Approves a payment request and grants the plan, atomically. The request row
-- is locked, so two concurrent approvals cannot both extend the subscription.
-- A renewal extends from the current expiry rather than from today, and a
-- lifetime grant (active, no expiry) stays lifetime.
CREATE OR REPLACE FUNCTION public.approve_subscription_request(
  p_request_id    uuid,
  p_duration_days integer
)
RETURNS TABLE (result text, approved_user_id text, expires_at timestamptz)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_request public."subscription_requests"%ROWTYPE;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days NOT BETWEEN 1 AND 3660 THEN
    RAISE EXCEPTION 'p_duration_days must be between 1 and 3660 (got %)', p_duration_days
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_request
  FROM public."subscription_requests" r
  WHERE r."id" = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request."status" = 'approved' THEN
    RETURN QUERY SELECT 'already_approved', v_request."user_id", NULL::timestamptz;
    RETURN;
  END IF;

  result := 'approved';
  approved_user_id := v_request."user_id";

  IF v_request."user_id" IS NOT NULL THEN
    UPDATE public."User" u
    SET "subscriptionStatus"    = 'active',
        "subscriptionExpiresAt" = CASE
          WHEN u."subscriptionStatus" = 'active' AND u."subscriptionExpiresAt" IS NULL THEN NULL
          ELSE greatest(u."subscriptionExpiresAt", now()) + make_interval(days => p_duration_days)
        END
    WHERE u."id" = v_request."user_id"
    RETURNING u."subscriptionExpiresAt" INTO expires_at;
  END IF;

  UPDATE public."subscription_requests" r
  SET "status" = 'approved'
  WHERE r."id" = p_request_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.approve_subscription_request(uuid, integer) IS
  'Approves a subscription request and activates or extends the user''s plan in one transaction. result is approved | already_approved | not_found.';


-- =============================================================================
-- Security
-- =============================================================================

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY pg_temp.sv_tables() LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
  END LOOP;

  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
                 pg_get_serial_sequence('public."PositionBiasLog"', 'id'));
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role',
                 pg_get_serial_sequence('public."PositionBiasLog"', 'id'));
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at()                                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_exists()                                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_subscription_review()                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_movies_from_user_embedding(extensions.vector, double precision, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_position_bias_ctr(interval)                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_subscription_request(uuid, integer)                        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.match_movies_from_user_embedding(extensions.vector, double precision, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_position_bias_ctr(interval)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_subscription_request(uuid, integer)                        TO service_role;

-- Supabase grants anon and authenticated full access to every new table,
-- sequence and function in public by default. Nothing in this app is meant
-- to be reachable with the public key, so new objects start closed too. To
-- expose one deliberately, GRANT it and write an RLS policy for it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;


-- =============================================================================
-- Data
-- =============================================================================

-- Signed-in telemetry never reached ml_interactions (the uuid column above),
-- so rebuild it from UserInteractions with the label mapping in
-- cinematch/ml/telemetry.ts. Device and network context was never captured
-- for these events and stays NULL. Runs only while no signed-in row exists,
-- so it cannot double-insert.
INSERT INTO public."ml_interactions"
  ("userId", "tmdbId", "mediaType", "interactionType", "label", "playbackProgress", "timestamp")
SELECT ui."userId",
       ui."tmdbId",
       ui."mediaType",
       ui."eventType",
       CASE
         WHEN ui."weight" >= 0.8 THEN 1.0
         WHEN ui."weight" >= 0.3 THEN 0.8
         WHEN ui."weight" >= 0   THEN 0.5
         ELSE 0.0
       END,
       ui."progress",
       ui."createdAt"
FROM public."UserInteractions" ui
WHERE NOT EXISTS (SELECT 1 FROM public."ml_interactions" WHERE "userId" IS NOT NULL);


-- =============================================================================
-- Scheduled jobs (pg_cron)
--
-- cron.schedule() replaces a job of the same name, so re-running is safe.
-- See them under Database → Cron Jobs, or: SELECT * FROM cron.job;
-- =============================================================================

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_cron is unavailable (%), so no jobs were scheduled. Enable it under Database → Extensions and run this file again.', SQLERRM;
    RETURN;
  END;

  -- Impressions older than the 90-day propensity window are never read.
  PERFORM cron.schedule(
    'positionbiaslog-retention',
    '0 3 * * *',
    $job$DELETE FROM public."PositionBiasLog" WHERE "loggedAt" < now() - interval '90 days'$job$
  );

  -- Past the 7-day stale-while-revalidate window a cached feed is never
  -- served (STALE_WHILE_REVALIDATE_TTL in homeTimeline.ts).
  PERFORM cron.schedule(
    'recommendation-cache-cleanup',
    '30 3 * * *',
    $job$DELETE FROM public."RecommendationCache" WHERE "computedAt" < now() - interval '7 days'$job$
  );

  -- Access already ends at subscriptionExpiresAt (lib/subscription.ts); this
  -- keeps the stored status truthful for anyone reading the table.
  PERFORM cron.schedule(
    'subscription-expiry',
    '5 * * * *',
    $job$UPDATE public."User" SET "subscriptionStatus" = 'expired' WHERE "subscriptionStatus" = 'active' AND "subscriptionExpiresAt" < now()$job$
  );
END;
$$;


-- =============================================================================
-- Verify
--
-- Any failure here raises, which rolls back everything above.
-- =============================================================================

DO $$
DECLARE
  v_problems text[] := '{}';
  v_table    text;
  r          record;
BEGIN
  FOREACH v_table IN ARRAY pg_temp.sv_tables() LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', v_table)::regclass) THEN
      v_problems := v_problems || format('%s: RLS is disabled', v_table);
    END IF;
    IF has_table_privilege('anon',          format('public.%I', v_table), 'SELECT, INSERT, UPDATE, DELETE')
    OR has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT, INSERT, UPDATE, DELETE') THEN
      v_problems := v_problems || format('%s: still readable or writable with the public key', v_table);
    END IF;
  END LOOP;

  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (pg_temp.sv_tables())
  LOOP
    v_problems := v_problems || format('%s: unexpected policy %s', r.tablename, r.policyname);
  END LOOP;

  FOR r IN
    SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid = ANY (SELECT format('public.%I', t)::regclass FROM unnest(pg_temp.sv_tables()) t)
      AND NOT convalidated
  LOOP
    v_problems := v_problems || format('%s: constraint %s is not validated', r.tbl, r.conname);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS fn FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('set_updated_at', 'ensure_user_exists', 'stamp_subscription_review',
                        'match_movies_from_user_embedding', 'get_position_bias_ctr',
                        'approve_subscription_request')
      AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
  LOOP
    v_problems := v_problems || format('%s: search_path is not pinned', r.fn);
  END LOOP;

  IF (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
      WHERE attrelid = 'public."ml_interactions"'::regclass AND attname = 'userId') <> 'text' THEN
    v_problems := v_problems || 'ml_interactions.userId is not text'::text;
  END IF;

  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION E'Schema verification failed, nothing was applied:\n  - %',
      array_to_string(v_problems, E'\n  - ');
  END IF;
END;
$$;

-- Fresh planner statistics after the rewrites above.
ANALYZE public."User", public."Favorite", public."ContinueWatching", public."Download",
        public."subscription_requests", public."UserInteractions", public."UserGenreProfile",
        public."RecommendationCache", public."PositionBiasLog", public."ml_interactions",
        public."movie_embeddings";

RESET lock_timeout;

-- Summary (the SQL editor shows this result).
SELECT c.relname                       AS "table",
       greatest(c.reltuples, 0)::bigint AS "rows",
       c.relrowsecurity                AS "rls",
       (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid)                  AS "constraints",
       (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid)                       AS "indexes",
       (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS "triggers"
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname = ANY (pg_temp.sv_tables())
ORDER BY c.relname;
