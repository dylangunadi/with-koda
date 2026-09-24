-- Koda Agentic Layer Migration
-- Adds source_note to recruiting_moves and autonomous brief settings to profiles

-- =============================================================================
-- 1. Add source_note to recruiting_moves
-- =============================================================================

alter table recruiting_moves
  add column if not exists source_note text;

-- =============================================================================
-- 2. Add autonomous brief settings to profiles
-- =============================================================================

alter table profiles
  add column if not exists autonomous_enabled boolean not null default false,
  add column if not exists brief_frequency text not null default 'daily',
  add column if not exists brief_email text;

-- =============================================================================
-- 3. Index for cron: find users with autonomous briefs enabled
-- =============================================================================

create index if not exists idx_profiles_autonomous
  on profiles(autonomous_enabled)
  where autonomous_enabled = true;
