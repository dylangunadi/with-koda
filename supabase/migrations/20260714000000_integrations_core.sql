-- Integration foundation: provider connections, encrypted token vault, and
-- sync run bookkeeping.
--
-- * integrations is the user-visible connection record (status, scopes,
--   cursor, last sync). Safe to read from the browser; contains no secrets.
-- * integration_tokens holds OAuth tokens encrypted with AES-256-GCM
--   (KODA_TOKEN_ENC_KEY). RLS is enabled with ZERO policies and grants are
--   revoked, so only the service role can touch it — the browser can never
--   read a token byte, even if a future policy on integrations regresses.
--   Token access in code goes exclusively through
--   src/lib/koda/integrations/tokens.ts (server-only module).
-- * integration_sync_runs records each sync for idempotency and settings-page
--   observability. stats contains counts only (koda_events privacy
--   convention) — never event titles, attendee emails, or posting content.

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'job_boards')),
  status text not null default 'connected' check (status in ('connected', 'error', 'pending')),
  account_label text,
  scopes text[] not null default '{}',
  config jsonb not null default '{}',
  sync_cursor text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_integrations_user_provider on integrations(user_id, provider);

create table integration_tokens (
  integration_id uuid primary key references integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token_enc text,
  refresh_token_enc text,
  access_token_expires_at timestamptz,
  updated_at timestamptz default now()
);

create table integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('scheduled', 'manual', 'initial')),
  run_date date not null default current_date,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  stats jsonb not null default '{}',
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Scheduled sync idempotency: one scheduled run per integration per day,
-- mirroring idx_briefs_scheduled_once_per_day. The cron claims a run row
-- before syncing; a unique violation means today's run already happened.
create unique index idx_sync_runs_scheduled_once_per_day
  on integration_sync_runs(integration_id, run_date)
  where trigger = 'scheduled';

create index idx_sync_runs_integration on integration_sync_runs(integration_id, started_at desc);

-- Dismissal state for the inbox integration recommendation card.
alter table profiles
  add column if not exists integrations_prompt_dismissed_at timestamptz;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table integrations enable row level security;
alter table integration_tokens enable row level security;
alter table integration_sync_runs enable row level security;

-- integrations policies (own-row full access; tokens live elsewhere)
create policy "Users can select their own integrations"
  on integrations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own integrations"
  on integrations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own integrations"
  on integrations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own integrations"
  on integrations for delete
  using (auth.uid() = user_id);

-- integration_tokens: NO policies on purpose. RLS is enabled and grants are
-- revoked, so anon/authenticated roles get nothing; only the service role
-- (which bypasses RLS) can read or write tokens.
revoke all on integration_tokens from anon, authenticated;

-- integration_sync_runs: users may observe their own runs (settings page);
-- all writes happen with the service role or server-side user client.
create policy "Users can select their own sync runs"
  on integration_sync_runs for select
  using (auth.uid() = user_id);
