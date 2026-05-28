-- Enable Row Level Security for public."User" table
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to select, insert, update, and delete their own record
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'User' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON public."User"
      FOR ALL
      USING (auth.uid()::text = id)
      WITH CHECK (auth.uid()::text = id);
  END IF;
END $$;
