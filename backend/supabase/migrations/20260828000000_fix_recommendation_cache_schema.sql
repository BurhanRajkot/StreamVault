-- ── Fix RecommendationCache column mismatch ──────────────────────
-- cinematch_migration.sql created this table with columns
-- (userId, payload, createdAt), but the application
-- (backend/src/cinematch/mixer/homeTimeline.ts) has always read/written
-- (userId, recommendations, computedAt, ttlSeconds). Every read/write
-- against the wrong columns fails silently (caught and swallowed), so this
-- stale-while-revalidate cache layer has never actually worked — every
-- L1 (in-process) cache miss falls through to a full, multi-second
-- recompute of the CineMatch pipeline instead of the cheap ~50ms DB read
-- it was designed for. This migration realigns the table with the code
-- the app has been running all along.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecommendationCache' AND column_name = 'payload'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecommendationCache' AND column_name = 'recommendations'
  ) THEN
    ALTER TABLE "RecommendationCache" RENAME COLUMN "payload" TO "recommendations";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecommendationCache' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecommendationCache' AND column_name = 'computedAt'
  ) THEN
    ALTER TABLE "RecommendationCache" RENAME COLUMN "createdAt" TO "computedAt";
  END IF;
END $$;

ALTER TABLE "RecommendationCache"
  ADD COLUMN IF NOT EXISTS "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "computedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "ttlSeconds" INTEGER NOT NULL DEFAULT 300;

-- ── Missing index for CineMatch profile hydration query ──────────
-- getUserProfile() (backend/src/cinematch/features/userProfile.ts) queries
-- `.eq('userId', ...).order('createdAt', desc).limit(200)`. The existing
-- idx_interactions_peer_lookup index is (userId, weight, createdAt DESC) —
-- because "weight" sits between userId and createdAt, Postgres can't use it
-- to satisfy a pure userId + createdAt-DESC query, forcing a sort on every
-- profile-cache miss. This index matches the query shape directly.
CREATE INDEX IF NOT EXISTS idx_interactions_user_created
  ON "UserInteractions" ("userId", "createdAt" DESC);

SELECT 'RecommendationCache schema fix + UserInteractions index complete' AS status;
