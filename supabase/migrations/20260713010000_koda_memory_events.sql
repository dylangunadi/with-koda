-- Koda relationship memory and product event log (Tier 3 of Talk to Koda).
--
-- * relationships stores structured relationship memory captured through
--   ongoing conversation. source_message preserves the user's original words
--   verbatim; rows are only created after explicit user confirmation.
-- * koda_events is a lightweight internal product event log. Properties must
--   contain only ids, enums, booleans, counts, and durations — never message
--   text, resume content, contact details, or work authorization values
--   (enforced by convention in src/lib/koda/events.ts and by test).

create table relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null,
  organization text,
  role_title text,
  context text,
  source_message text,
  source_message_id uuid references koda_messages(id) on delete set null,
  interaction_date date,
  follow_up_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_relationships_user on relationships(user_id, created_at desc);

create table koda_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz default now()
);

create index idx_koda_events_user_name on koda_events(user_id, event_name, created_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table relationships enable row level security;
alter table koda_events enable row level security;

-- relationships policies
create policy "Users can select their own relationships"
  on relationships for select
  using (auth.uid() = user_id);

create policy "Users can insert their own relationships"
  on relationships for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own relationships"
  on relationships for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own relationships"
  on relationships for delete
  using (auth.uid() = user_id);

-- koda_events policies
create policy "Users can select their own events"
  on koda_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own events"
  on koda_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own events"
  on koda_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own events"
  on koda_events for delete
  using (auth.uid() = user_id);
