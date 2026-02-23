-- Create a table specifically structured for Machine Learning training (Table A: The Interaction Matrix)
CREATE TABLE IF NOT EXISTS public."ml_interactions" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "userId" UUID REFERENCES auth.users NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "interactionType" TEXT NOT NULL, -- e.g., 'CLICK', 'WATCH_START', 'WATCH_COMPLETE', 'DISLIKE'
  "label" REAL NOT NULL, -- normalized weight for ML (e.g., 0.0 to 1.0)
  "timestamp" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast ML dumps
CREATE INDEX IF NOT EXISTS "ml_interactions_user_id_idx" ON public."ml_interactions" ("userId");
CREATE INDEX IF NOT EXISTS "ml_interactions_timestamp_idx" ON public."ml_interactions" ("timestamp");

-- Enable RLS
ALTER TABLE public."ml_interactions" ENABLE ROW LEVEL SECURITY;

-- Only admins/service role can access this raw ML training data directly via API
CREATE POLICY "Enable read access for service role only" ON public."ml_interactions"
    AS PERMISSIVE FOR SELECT
    TO service_role
    USING (true);

CREATE POLICY "Enable insert access for service role only" ON public."ml_interactions"
    AS PERMISSIVE FOR INSERT
    TO service_role
    WITH CHECK (true);
