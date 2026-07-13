-- Gmail integration: provider registration and normalized thread records.
--
-- external_threads stores metadata for recruiting threads matched by the
-- user's configured search query — subject, snippet, participants, and
-- reply state. Bodies are never stored; the snippet is what Gmail's API
-- returns for the thread list, truncated at write time. Koda can create
-- Gmail DRAFTS on explicit per-move user action, and has no code path that
-- sends mail.

alter table integrations drop constraint integrations_provider_check;
alter table integrations add constraint integrations_provider_check
  check (provider in ('google_calendar', 'job_boards', 'gmail'));

create table external_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references integrations(id) on delete cascade,
  provider text not null default 'gmail',
  external_id text not null,
  subject text,
  snippet text,
  participants jsonb not null default '[]',
  last_from_email text,
  last_message_at timestamptz,
  message_count integer not null default 1,
  needs_reply boolean not null default false,
  relationship_id uuid references relationships(id) on delete set null,
  permalink text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_external_threads_dedup on external_threads(user_id, provider, external_id);
create index idx_external_threads_user_reply
  on external_threads(user_id, needs_reply, last_message_at desc);

alter table recruiting_moves
  add column if not exists external_thread_id uuid references external_threads(id) on delete set null;
create index if not exists idx_moves_external_thread
  on recruiting_moves(external_thread_id) where external_thread_id is not null;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table external_threads enable row level security;

create policy "Users can select their own external threads"
  on external_threads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own external threads"
  on external_threads for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own external threads"
  on external_threads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own external threads"
  on external_threads for delete
  using (auth.uid() = user_id);
