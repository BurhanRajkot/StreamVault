-- ============================================================
-- CineMatch AI — Supabase Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- User interaction events for collaborative filtering
CREATE TABLE IF NOT EXISTS "UserInteractions" (
  "id"         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "tmdbId"     INTEGER NOT NULL,
  "mediaType"  TEXT NOT NULL CHECK ("mediaType" IN ('movie', 'tv')),
  "eventType"  TEXT NOT NULL CHECK ("eventType" IN ('watch', 'favorite', 'click', 'search', 'rate')),
  "weight"     FLOAT NOT NULL DEFAULT 1.0,  -- Engagement weight (see interactionTracker.ts)
  "progress"   FLOAT,                         -- 0..1 for watch events
  "rating"     FLOAT,                         -- 1..5 for rate events
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user history lookups
CREATE INDEX IF NOT EXISTS "idx_interactions_userId"
  ON "UserInteractions" ("userId", "createdAt" DESC);

-- Index for collaborative filtering (find users who watched the same thing)
CREATE INDEX IF NOT EXISTS "idx_interactions_tmdbId"
  ON "UserInteractions" ("tmdbId", "mediaType");

-- Persisted recommendation cache per user (avoids recomputing on every request)
CREATE TABLE IF NOT EXISTS "RecommendationCache" (
  "userId"          TEXT PRIMARY KEY,
  "recommendations" JSONB NOT NULL,  -- Array of ScoredCandidate
  "computedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ttlSeconds"      INTEGER NOT NULL DEFAULT 300
);

-- Index for cache freshness checks
CREATE INDEX IF NOT EXISTS "idx_reccache_computedAt"
  ON "RecommendationCache" ("computedAt");

-- User Genre Affinity — pre-computed genre vectors (updated on interaction)
CREATE TABLE IF NOT EXISTS "UserGenreProfile" (
  "userId"    TEXT PRIMARY KEY,
  "genreMap"  JSONB NOT NULL DEFAULT '{}',  -- { "28": 0.9, "878": 0.7, ... }
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
