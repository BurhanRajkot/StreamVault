-- ============================================================
-- CineMatch AI — Full Schema Migration
-- Run once in Supabase SQL editor or via psql
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DO blocks
-- ============================================================

-- ── 1. UserInteractions ─────────────────────────────────────
-- Hardened constraints for the interaction table
CREATE TABLE IF NOT EXISTS "UserInteractions" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      TEXT        NOT NULL,
  "tmdbId"      INTEGER     NOT NULL,
  "mediaType"   TEXT        NOT NULL CHECK ("mediaType" IN ('movie', 'tv')),
  "eventType"   TEXT        NOT NULL CHECK ("eventType" IN ('watch', 'favorite', 'click', 'search', 'rate', 'dislike')),
  "weight"      NUMERIC(4,3) NOT NULL DEFAULT 1.0 CHECK ("weight" BETWEEN -1.0 AND 1.0),
  "progress"    NUMERIC(4,3) CHECK ("progress" BETWEEN 0 AND 1),
  "rating"      SMALLINT     CHECK ("rating" BETWEEN 1 AND 5),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for collaborative filtering peer lookups
CREATE INDEX IF NOT EXISTS idx_interactions_peer_lookup
  ON "UserInteractions" ("userId", "weight", "createdAt" DESC);

-- Standard lookups
CREATE INDEX IF NOT EXISTS idx_interactions_user_id
  ON "UserInteractions" ("userId");

CREATE INDEX IF NOT EXISTS idx_interactions_tmdb
  ON "UserInteractions" ("tmdbId");

-- ── 2. UserGenreProfile ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserGenreProfile" (
  "userId"    TEXT PRIMARY KEY,
  "genreMap"  JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. UserKeywordProfile (NEW) ──────────────────────────────
CREATE TABLE IF NOT EXISTS "UserKeywordProfile" (
  "userId"      TEXT PRIMARY KEY,
  "keywordMap"  JSONB NOT NULL DEFAULT '{}',
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. UserCastProfile (NEW) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserCastProfile" (
  "userId"    TEXT PRIMARY KEY,
  "castMap"   JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. RecommendationCache ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecommendationCache" (
  "userId"    TEXT        NOT NULL,
  "payload"   JSONB       NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId")
);

-- ── 6. Enable Row-Level Security ─────────────────────────────
ALTER TABLE "UserInteractions"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserGenreProfile"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserKeywordProfile"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCastProfile"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecommendationCache"  ENABLE ROW LEVEL SECURITY;

-- ── 7. RLS Policies (owner-only, skip if already exist) ──────

-- UserInteractions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserInteractions' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON "UserInteractions"
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;

-- UserGenreProfile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserGenreProfile' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON "UserGenreProfile"
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;

-- UserKeywordProfile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserKeywordProfile' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON "UserKeywordProfile"
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;

-- UserCastProfile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserCastProfile' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON "UserCastProfile"
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;

-- RecommendationCache
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'RecommendationCache' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON "RecommendationCache"
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;

-- ── 8. Service role bypass policies ──────────────────────────
-- Allow the backend service role to bypass RLS for all tables

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserInteractions' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON "UserInteractions"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserGenreProfile' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON "UserGenreProfile"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserKeywordProfile' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON "UserKeywordProfile"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'UserCastProfile' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON "UserCastProfile"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'RecommendationCache' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON "RecommendationCache"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Done ──────────────────────────────────────────────────────
SELECT 'CineMatch schema migration complete ✅' AS status;
