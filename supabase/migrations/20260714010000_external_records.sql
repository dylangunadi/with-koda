-- Normalized external source records imported by integrations, plus move
-- provenance columns.
--
-- * external_events are calendar events from the user's own connected
--   calendar. Cancelled events are marked, never hard-deleted, because moves
--   may reference them. description_snippet is truncated at write time so
--   model context stays bounded.
-- * external_opportunities are job postings fetched from public ATS boards
--   (Greenhouse/Lever). Rows are per-user: simpler RLS, and disconnect
--   deletion stays an honest cascade.
-- * recruiting_moves gains links to the external record a move is grounded
--   in. source_url and source_fetched_at are copied onto the move at insert
--   time so provenance display survives a later disconnect (FKs null out;
--   the copied URL remains as the user's history).

create table external_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references integrations(id) on delete cascade,
  provider text not null default 'google_calendar',
  external_id text not null,
  title text,
  description_snippet text,
  start_at timestamptz,
  end_at timestamptz,
  location text,
  attendees jsonb not null default '[]',
  organizer_email text,
  html_link text,
  event_status text not null default 'confirmed' check (event_status in ('confirmed', 'cancelled')),
  classification text check (classification in ('coffee_chat', 'recruiter_call', 'interview', 'deadline', 'other')),
  relationship_id uuid references relationships(id) on delete set null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_external_events_dedup on external_events(user_id, provider, external_id);
create index idx_external_events_user_start on external_events(user_id, start_at);

create table external_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references integrations(id) on delete cascade,
  provider text not null check (provider in ('greenhouse', 'lever')),
  board_token text not null,
  external_id text not null,
  company text not null,
  title text not null,
  location text,
  department text,
  absolute_url text not null,
  source_posted_at timestamptz,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  verification_status text not null default 'verified_live' check (verification_status in ('verified_live', 'stale', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_external_opps_dedup
  on external_opportunities(user_id, provider, board_token, external_id);
create index idx_external_opps_user_live
  on external_opportunities(user_id, verification_status, last_seen_at desc);

alter table recruiting_moves
  add column if not exists external_event_id uuid references external_events(id) on delete set null,
  add column if not exists external_opportunity_id uuid references external_opportunities(id) on delete set null,
  add column if not exists source_url text,
  add column if not exists source_fetched_at timestamptz;

create index if not exists idx_moves_external_event
  on recruiting_moves(external_event_id) where external_event_id is not null;
create index if not exists idx_moves_external_opportunity
  on recruiting_moves(external_opportunity_id) where external_opportunity_id is not null;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table external_events enable row level security;
alter table external_opportunities enable row level security;

-- external_events policies
create policy "Users can select their own external events"
  on external_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own external events"
  on external_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own external events"
  on external_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own external events"
  on external_events for delete
  using (auth.uid() = user_id);

-- external_opportunities policies
create policy "Users can select their own external opportunities"
  on external_opportunities for select
  using (auth.uid() = user_id);

create policy "Users can insert their own external opportunities"
  on external_opportunities for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own external opportunities"
  on external_opportunities for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own external opportunities"
  on external_opportunities for delete
  using (auth.uid() = user_id);
