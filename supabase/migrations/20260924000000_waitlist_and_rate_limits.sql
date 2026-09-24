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

-- SECURITY DEFINER functions below pin search_path to '' and schema-qualify
-- every object: with a non-empty path, Postgres still resolves relations in
-- the caller's pg_temp schema first, so a caller could shadow a table.
-- (Built-ins such as now() and random() live in pg_catalog, which is always
-- searched.)

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
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  n integer;
begin
  insert into public.rate_limit_counters as c (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start)
  do update set hits = c.hits + 1
  returning c.hits into n;

  -- Occasional cleanup of expired windows keeps the table small.
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '2 days';
  end if;

  return n <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Brief confirmation emails: callable by signed-in users, keyed on the
-- caller's own id (from the JWT, never a parameter) and on p_email_hash, an
-- HMAC-SHA256 (hex) of the lowercased destination address computed by the
-- API route with RATE_LIMIT_SECRET. The database never sees the address.
-- Limits: 5 per user per hour, 3 per address per day.
drop function if exists public.claim_brief_confirmation_email(text);
create function public.claim_brief_confirmation_email(p_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'p_email_hash must be a hex HMAC-SHA256 digest';
  end if;
  if not public.rate_limit_hit('brief_confirm:user:' || uid::text, 3600, 5) then
    return false;
  end if;
  return public.rate_limit_hit('brief_confirm:email:' || p_email_hash, 86400, 3);
end;
$$;

revoke execute on function public.claim_brief_confirmation_email(text) from public, anon;
grant execute on function public.claim_brief_confirmation_email(text) to authenticated;

-- Fail the migration if the grants are not what the app relies on (for
-- example, platform default privileges re-granting EXECUTE to API roles).
do $$
begin
  if has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute') then
    raise exception 'rate_limit_hit must not be executable by anon or authenticated';
  end if;
  if has_function_privilege('anon', 'public.claim_brief_confirmation_email(text)', 'execute') then
    raise exception 'claim_brief_confirmation_email must not be executable by anon';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.oid in ('public.rate_limit_hit(text,integer,integer)'::regprocedure,
                    'public.claim_brief_confirmation_email(text)'::regprocedure)
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']
  ) then
    raise exception 'SECURITY DEFINER functions must pin search_path to empty';
  end if;
end $$;
