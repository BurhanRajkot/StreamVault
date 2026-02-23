-- Allow guest telemetry collection in ml_interactions table

-- 1. Make userId optional
ALTER TABLE public."ml_interactions"
ALTER COLUMN "userId" DROP NOT NULL;

-- 2. Add an optional sessionId column to track guest telemetry
ALTER TABLE public."ml_interactions"
ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

-- 3. Add an index to query by sessionId efficiently
CREATE INDEX IF NOT EXISTS "ml_interactions_session_id_idx" ON public."ml_interactions" ("sessionId");

-- 4. Add rich contextual features for advanced ML prediction
ALTER TABLE public."ml_interactions"
ADD COLUMN IF NOT EXISTS "networkType" TEXT,
ADD COLUMN IF NOT EXISTS "browserLanguage" TEXT,
ADD COLUMN IF NOT EXISTS "localHour" SMALLINT,
ADD COLUMN IF NOT EXISTS "timezone" TEXT;
