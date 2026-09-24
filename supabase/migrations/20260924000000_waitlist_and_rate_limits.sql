-- Waitlist table under version control, locked-down inserts, and a small
-- Supabase-backed rate limiter used by /api/waitlist and /api/briefs.
-- Idempotent: safe on a fresh database and on production, where the waitlist
-- table already exists (created outside the repo).

-- ---------------------------------------------------------------------------
-- 1. Waitlist table (columns written by src/app/api/waitlist/route.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  school text,
  class_year text,
  recruiting_stage text,
  source text,
  status text default 'new',
  created_at timestamptz not null default now()
);

alter table public.waitlist
  add column if not exists name text,
  add column if not exists school text,
  add column if not exists class_year text,
  add column if not exists recruiting_stage text,
  add column if not exists source text,
  add column if not exists status text default 'new',
  add column if not exists created_at timestamptz not null default now();

-- The route treats a unique violation (23505) as "already on the list".
-- Only add an index if no single-column unique index on email exists yet.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'public.waitlist'::regclass
      and i.indisunique
      and i.indnatts = 1
      and a.attname = 'email'
  ) then
    create unique index waitlist_email_key on public.waitlist (email);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tighten waitlist access: server-side (service role) inserts only.
-- The API route now fails closed without the service key, so the public
-- insert policies are no longer needed.
-- ---------------------------------------------------------------------------
alter table public.waitlist enable row level security;
drop policy if exists "Anyone can join waitlist" on public.waitlist;
drop policy if exists "allow anon insert" on public.waitlist;
revoke all on public.waitlist from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fixed-window rate limiter
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- Record one hit for p_key in the current window; true while within p_limit.
-- Atomic under concurrency (single upsert). Keys must not contain raw
-- personal data: callers hash IPs and email addresses.
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  n integer;
begin
  insert into rate_limit_counters (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start)
  do update set hits = rate_limit_counters.hits + 1
  returning hits into n;

  -- Occasional cleanup of expired windows keeps the table small.
  if random() < 0.01 then
    delete from rate_limit_counters where window_start < now() - interval '2 days';
  end if;

  return n <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Brief confirmation emails: callable by signed-in users, keyed on the
-- caller's own id (from the JWT, never a parameter) and a hash of the
-- destination address. Limits: 5 per user per hour, 3 per address per day.
create or replace function public.claim_brief_confirmation_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;
  if not rate_limit_hit('brief_confirm:user:' || uid::text, 3600, 5) then
    return false;
  end if;
  return rate_limit_hit(
    'brief_confirm:email:' || md5(lower(trim(p_email))),
    86400,
    3
  );
end;
$$;

revoke execute on function public.claim_brief_confirmation_email(text) from public, anon;
grant execute on function public.claim_brief_confirmation_email(text) to authenticated;
