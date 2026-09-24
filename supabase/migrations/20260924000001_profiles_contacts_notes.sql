-- Production drift repair: production's schema was created from a dashboard
-- migration that predates profiles.contacts_notes, which the repo's
-- 20260710000000_koda_mvp_schema.sql creates and onboarding/settings write.
-- No-op everywhere the column already exists.
alter table public.profiles
  add column if not exists contacts_notes text;
