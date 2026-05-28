-- Add RLS policies for public."Profile"
-- The table already has RLS enabled, but we need to add policies so it's accessible.

-- 1. Owner policy (assuming 'id' is the user identifier column that matches auth.uid())
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Profile' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON public."Profile"
      FOR ALL
      USING (auth.uid()::text = id::text)
      WITH CHECK (auth.uid()::text = id::text);
  END IF;
EXCEPTION
  WHEN undefined_column THEN
    -- If 'id' doesn't exist, we skip creating this policy to avoid migration errors.
    -- The user may need to manually adjust this if their user column is named differently.
    NULL;
END $$;

-- 2. Service role bypass (allows backend API to bypass RLS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Profile' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON public."Profile"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
