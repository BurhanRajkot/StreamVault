-- =============================================================================
-- User access controls (2026-11-15)
--
-- What the admin dashboard's Users panel reads and writes:
--   - who each account is (email, name — sent by the app after sign-in) and
--     when it was last seen;
--   - whether it may use the ⚡ Premium (Real-Debrid) server: 'none'
--     (default), 'granted', or 'paused' (approved, switched off for now);
--   - whether the account is suspended (signed-in features refused);
-- and a site-wide setting to pause Premium for everyone but the admin.
--
-- Safe to run more than once. Apply it in the Supabase SQL editor; the
-- backend works without it (Premium stays admin-only, nobody is suspended)
-- and the dashboard says when it is missing.
-- =============================================================================

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "email"         text,
  ADD COLUMN IF NOT EXISTS "name"          text,
  ADD COLUMN IF NOT EXISTS "lastSeenAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "premiumAccess" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "suspendedAt"   timestamptz;

ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS user_premium_access_check;
ALTER TABLE public."User"
  ADD CONSTRAINT user_premium_access_check CHECK ("premiumAccess" IN ('none', 'granted', 'paused'));

ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS user_email_length_check;
ALTER TABLE public."User"
  ADD CONSTRAINT user_email_length_check CHECK ("email" IS NULL OR length("email") <= 254);

ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS user_name_length_check;
ALTER TABLE public."User"
  ADD CONSTRAINT user_name_length_check CHECK ("name" IS NULL OR length("name") <= 120);

-- The Users panel lists the most recently active accounts first.
CREATE INDEX IF NOT EXISTS idx_user_last_seen ON public."User" ("lastSeenAt" DESC NULLS LAST);

COMMENT ON COLUMN public."User"."premiumAccess" IS
  'Premium (Real-Debrid) server access set by the admin: none | granted | paused.';
COMMENT ON COLUMN public."User"."suspendedAt" IS
  'When the admin suspended this account; NULL when active. Suspended accounts are refused on signed-in routes.';

-- Site-wide switches the admin flips from the dashboard.
CREATE TABLE IF NOT EXISTS public."AppSetting" (
  "key"       text        PRIMARY KEY,
  "value"     jsonb       NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public."AppSetting" IS
  'Site-wide settings changed from the admin dashboard, e.g. key ''premium'' → {"pausedForAll": bool}.';

-- Same lockdown as every other table: only the backend's service role.
ALTER TABLE public."AppSetting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AppSetting" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public."AppSetting" TO service_role;

-- PostgREST caches the schema; make it see the new columns now.
NOTIFY pgrst, 'reload schema';
