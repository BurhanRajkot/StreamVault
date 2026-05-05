-- ============================================================
-- CineMatch AI — Enrich UserGenreProfile with additional taste vectors
-- Adds keyword, cast, director, and decade maps to the existing table.
-- Safe to re-run: uses IF NOT EXISTS column adds.
-- ============================================================

ALTER TABLE "UserGenreProfile"
  ADD COLUMN IF NOT EXISTS "keywordMap"  JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "castMap"     JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "directorMap" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "decadeMap"   JSONB NOT NULL DEFAULT '{}';

SELECT 'UserGenreProfile enrichment migration complete ✅' AS status;
