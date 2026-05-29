-- Enable Row Level Security for public."Favorite" table
ALTER TABLE public."Favorite" ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to select, insert, update, and delete their own records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Favorite' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON public."Favorite"
      FOR ALL
      USING (auth.uid()::text = "userId")
      WITH CHECK (auth.uid()::text = "userId");
  END IF;
END $$;
