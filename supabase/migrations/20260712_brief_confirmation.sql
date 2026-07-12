-- Require email confirmation before autonomous briefs become active.
alter table profiles
  add column if not exists brief_confirmed boolean not null default false,
  add column if not exists brief_confirmation_token text,
  add column if not exists brief_confirmation_expires_at timestamptz,
  add column if not exists pending_brief_frequency text,
  add column if not exists pending_brief_email text;

create unique index if not exists idx_profiles_brief_confirmation_token
  on profiles(brief_confirmation_token)
  where brief_confirmation_token is not null;

-- Existing opt-ins retain their preference but are excluded by brief_confirmed
-- until they request and complete confirmation.
