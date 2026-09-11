-- Adds an expiry timestamp to subscriptions so "monthly"/"quarterly" plans
-- actually lapse instead of granting permanent access on first approval.
-- NULL means no expiry (e.g. pre-existing lifetime grants).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMPTZ;
