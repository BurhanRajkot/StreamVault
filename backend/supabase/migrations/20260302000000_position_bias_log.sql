-- ============================================================
-- CineMatch Phase 4: PositionBiasLog Table
--
-- Stores display position impressions for Inverse Propensity Scoring (IPS).
-- This table is the foundation of the unbiased learning-to-rank pipeline.
--
-- Every time a user clicks/watches an item, we log:
--   - The position it was displayed at (0-indexed)
--   - Whether it was clicked
--   - Which recommendation source produced it
--
-- The IPS estimator (positionBias.ts) reads this table to compute:
--   propensity(pos) = CTR(pos) / CTR(pos=0)
-- and uses it to correct raw interaction weights for position bias.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PositionBiasLog" (
  id              BIGSERIAL PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "tmdbId"        INTEGER NOT NULL,
  "mediaType"     TEXT NOT NULL CHECK ("mediaType" IN ('movie', 'tv')),
  "displayPosition" INTEGER NOT NULL,  -- 0-indexed position in the recommendation list
  clicked         BOOLEAN NOT NULL DEFAULT FALSE,
  source          TEXT,               -- CandidateSource enum value
  "loggedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for propensity query performance
CREATE INDEX IF NOT EXISTS idx_position_bias_position
  ON "PositionBiasLog" ("displayPosition");

CREATE INDEX IF NOT EXISTS idx_position_bias_user
  ON "PositionBiasLog" ("userId");

CREATE INDEX IF NOT EXISTS idx_position_bias_logged_at
  ON "PositionBiasLog" ("loggedAt");

-- Composite index for the most common query: position + clicked
CREATE INDEX IF NOT EXISTS idx_position_bias_position_clicked
  ON "PositionBiasLog" ("displayPosition", clicked);

-- Retention: auto-delete impressions older than 90 days
-- (run this as a pg_cron job or Supabase Edge Function on a schedule)
-- DELETE FROM "PositionBiasLog" WHERE "loggedAt" < NOW() - INTERVAL '90 days';

-- Row-Level Security: users can't read each other's position logs
ALTER TABLE "PositionBiasLog" ENABLE ROW LEVEL SECURITY;

-- Only the service role (backend) can read and write
CREATE POLICY "service_role_full_access" ON "PositionBiasLog"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
