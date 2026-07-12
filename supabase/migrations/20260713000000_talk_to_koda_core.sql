-- Talk to Koda core schema
-- Adds: conversational onboarding state, first-class briefs, move display fields,
-- and profile fields gathered by conversational onboarding.
--
-- Notes:
-- * profiles.focus_options fixes a pre-existing drift: saveProfile writes it and
--   prompts.ts reads it, but no prior migration created the column.
-- * brief_frequency gains the conventional value 'manual' (text column, no DDL
--   needed). Manual = autonomous_enabled false. Choosing Daily/Weekly during
--   onboarding review sets autonomous_enabled + brief_confirmed in-product;
--   email delivery still requires the separate email confirmation flow and
--   brief_email stays null until that flow completes.
-- * recruiting_moves gains nullable display fields only; existing rows and the
--   legacy 'sent' status remain valid.

-- =============================================================================
-- 1. profiles — fields gathered by conversational onboarding
-- =============================================================================

alter table profiles
  add column if not exists focus_options text[] default '{}',
  add column if not exists recruiting_stage text,
  add column if not exists timeline text,
  add column if not exists proof_points text,
  add column if not exists success_definition text;

-- =============================================================================
-- 2. briefs — a persisted batch of recommended moves
-- =============================================================================

create table briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'manual', -- 'onboarding' | 'manual' | 'scheduled'
  brief_date date not null default current_date,
  summary text,
  created_at timestamptz default now()
);

create index idx_briefs_user_created on briefs(user_id, created_at desc);

-- Cron idempotency: at most one scheduled brief per user per day.
create unique index idx_briefs_scheduled_once_per_day
  on briefs(user_id, brief_date)
  where source = 'scheduled';

-- =============================================================================
-- 3. recruiting_moves — brief linkage and display fields
-- =============================================================================

alter table recruiting_moves
  add column if not exists brief_id uuid references briefs(id) on delete set null,
  add column if not exists priority text,
  add column if not exists effort text,
  add column if not exists expected_outcome text,
  add column if not exists source_status text not null default 'ai_suggested';

create index if not exists idx_recruiting_moves_brief on recruiting_moves(brief_id);

-- =============================================================================
-- 4. koda_conversations — structured conversation state (resume mechanism)
-- =============================================================================

create table koda_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'onboarding', -- 'onboarding' | 'ongoing'
  status text not null default 'active',   -- 'active' | 'completed'
  extracted jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One active onboarding conversation per user (race-safe create + resume).
create unique index idx_one_active_onboarding
  on koda_conversations(user_id)
  where kind = 'onboarding' and status = 'active';

create index idx_koda_conversations_user on koda_conversations(user_id, updated_at desc);

-- =============================================================================
-- 5. koda_messages — conversation transcript with structured payloads
-- =============================================================================

create table koda_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references koda_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,             -- 'user' | 'koda'
  content text not null,
  input_mode text default 'text', -- 'text' | 'voice'
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create index idx_koda_messages_conversation on koda_messages(conversation_id, created_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table briefs enable row level security;
alter table koda_conversations enable row level security;
alter table koda_messages enable row level security;

-- briefs policies
create policy "Users can select their own briefs"
  on briefs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own briefs"
  on briefs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own briefs"
  on briefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own briefs"
  on briefs for delete
  using (auth.uid() = user_id);

-- koda_conversations policies
create policy "Users can select their own conversations"
  on koda_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on koda_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on koda_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on koda_conversations for delete
  using (auth.uid() = user_id);

-- koda_messages policies
create policy "Users can select their own messages"
  on koda_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own messages"
  on koda_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own messages"
  on koda_messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own messages"
  on koda_messages for delete
  using (auth.uid() = user_id);
