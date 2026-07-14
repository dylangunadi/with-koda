-- Koda MVP Schema Migration
-- Creates profiles, recruiting_moves, and move_events tables
-- Does NOT touch the existing waitlist table

-- =============================================================================
-- 1. profiles — user recruiting profiles
-- =============================================================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  school text,
  year text,
  target_roles text[] default '{}',
  target_companies text[] default '{}',
  industries text[] default '{}',
  locations text[] default '{}',
  work_auth text,
  resume_text text,
  linkedin_url text,
  contacts_notes text,
  semester_goal text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

-- =============================================================================
-- 2. recruiting_moves — AI-generated recruiting moves
-- =============================================================================

create table recruiting_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null,
  company text,
  person text,
  fit_reason text,
  suggested_action text,
  outreach_draft text,
  proof_of_work_idea text,
  follow_up_timing text,
  confidence real default 0.5,
  status text not null default 'generated',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- 3. move_events — feedback tracking
-- =============================================================================

create table move_events (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null references recruiting_moves(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

create index idx_profiles_user_id on profiles(user_id);
create index idx_recruiting_moves_user_id_status on recruiting_moves(user_id, status);
create index idx_move_events_move_id on move_events(move_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table recruiting_moves enable row level security;
alter table move_events enable row level security;

-- profiles policies
create policy "Users can select their own profile"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own profile"
  on profiles for delete
  using (auth.uid() = user_id);

-- recruiting_moves policies
create policy "Users can select their own moves"
  on recruiting_moves for select
  using (auth.uid() = user_id);

create policy "Users can insert their own moves"
  on recruiting_moves for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own moves"
  on recruiting_moves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own moves"
  on recruiting_moves for delete
  using (auth.uid() = user_id);

-- move_events policies
create policy "Users can select their own events"
  on move_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own events"
  on move_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own events"
  on move_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own events"
  on move_events for delete
  using (auth.uid() = user_id);
