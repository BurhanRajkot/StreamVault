-- Enable Row Level Security for public."Download" table
ALTER TABLE public."Download" ENABLE ROW LEVEL SECURITY;

-- Allow the backend service role to bypass RLS for this table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Download' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON public."Download"
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
