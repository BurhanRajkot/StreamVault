-- Migration for Rich ML Telemetry (Table A: The Interaction Matrix)
-- This expands the existing ml_interactions table to capture more detailed contextual vectors.

-- Add new contextual columns to ml_interactions
-- Using IF NOT EXISTS safely inside a DO block, or by just adding columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='mediaType') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "mediaType" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='selectedServer') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "selectedServer" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='deviceType') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "deviceType" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='os') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "os" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='browser') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "browser" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='country') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "country" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ml_interactions' AND column_name='playbackProgress') THEN
        ALTER TABLE public."ml_interactions" ADD COLUMN "playbackProgress" REAL;
    END IF;
END $$;
