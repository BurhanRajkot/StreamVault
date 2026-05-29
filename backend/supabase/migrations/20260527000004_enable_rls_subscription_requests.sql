-- Enable Row Level Security for public."subscription_requests" table
ALTER TABLE public."subscription_requests" ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to select, insert, update, and delete their own records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_requests' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON public."subscription_requests"
      FOR ALL
      USING (auth.uid()::text = "user_id")
      WITH CHECK (auth.uid()::text = "user_id");
  END IF;
END $$;
