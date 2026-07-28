-- ============================================================
-- Baseline: core application tables
--
-- These five tables were created by hand in the Supabase dashboard and were
-- never captured in a migration, even though later migrations (the 20260527*
-- series) ALTER them to enable RLS. On any fresh database those migrations
-- fail with `relation "public.User" does not exist`, so the migration chain
-- could not rebuild the schema. This file closes that gap.
--
-- Timestamped ahead of every other migration so it runs first.
--
-- SAFE TO RUN ON PRODUCTION: every statement is IF NOT EXISTS. Where a table
-- already exists the CREATE is skipped entirely and the existing definition —
-- including its data — is left untouched.
-- ============================================================

-- ── User ─────────────────────────────────────────────────────
-- id is the Auth0 subject (a string such as "auth0|abc123"), not a UUID.
-- subscriptionStatus is the column the download paywall gates on
-- (routes/downloads.ts → isPaidUser) and the column admin approval writes.
CREATE TABLE IF NOT EXISTS public."User" (
  "id"                 TEXT PRIMARY KEY,
  "subscriptionStatus" TEXT        NOT NULL DEFAULT 'inactive',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Favorite ─────────────────────────────────────────────────
-- The application supplies id (uuidv4) on insert; the default only covers
-- rows created outside the API.
CREATE TABLE IF NOT EXISTS public."Favorite" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE,
  "tmdbId"    INTEGER     NOT NULL,
  "mediaType" TEXT        NOT NULL CHECK ("mediaType" IN ('movie', 'tv')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ContinueWatching ─────────────────────────────────────────
-- Note: the API does NOT supply id on insert, so the default is load-bearing.
CREATE TABLE IF NOT EXISTS public."ContinueWatching" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT             NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE,
  "tmdbId"    INTEGER          NOT NULL,
  "mediaType" TEXT             NOT NULL CHECK ("mediaType" IN ('movie', 'tv')),
  "season"    INTEGER,
  "episode"   INTEGER,
  "progress"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "server"    TEXT,
  "createdAt" TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ── Download ─────────────────────────────────────────────────
-- id is a human-readable slug ("seed-mumbai-mafia"), not a UUID.
-- externalUrl, when set, makes the route 302-redirect instead of streaming
-- the file out of the `downloads` storage bucket.
CREATE TABLE IF NOT EXISTS public."Download" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "title"       TEXT,
  "quality"     TEXT,
  "filename"    TEXT        NOT NULL,
  "externalUrl" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── subscription_requests ────────────────────────────────────
-- snake_case throughout, unlike the tables above — this matches the existing
-- RLS policy in 20260527000004, which keys on "user_id".
--
-- user_id is nullable: guest submissions carry no account.
CREATE TABLE IF NOT EXISTS public."subscription_requests" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        TEXT REFERENCES public."User"("id") ON DELETE SET NULL,
  "email"          TEXT,
  "plan_id"        TEXT        NOT NULL,
  "amount"         NUMERIC(10, 2),
  "currency"       TEXT        NOT NULL DEFAULT 'INR',
  "transaction_id" TEXT        NOT NULL,
  "status"         TEXT        NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
