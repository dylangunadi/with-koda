-- Post-migration verification for the cleanup/v3 production rollout.
--
-- Usage (after `supabase db push --linked`):
--   psql "$PROD_DB_URL" -f scripts/verify-prod.sql
--
-- Read-only: everything runs inside a READ ONLY transaction that is rolled
-- back. Expected results are noted above each query; any difference means
-- stop and investigate before deploying the app.

\set ON_ERROR_STOP on
begin transaction read only;

-- 1. New tables exist with RLS on.
-- Expected (7 rows):
--   briefs, koda_conversations, koda_events, koda_messages, relationships -> rls_on = t, policies = 4
--   rate_limit_counters, waitlist                                          -> rls_on = t, policies = 0
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('briefs','koda_conversations','koda_messages','relationships','koda_events','rate_limit_counters','waitlist')
order by 1;

-- 2. Required indexes (the unique ones back the idempotency guarantees).
-- Expected: 8 rows, all names listed below.
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_briefs_scheduled_once_per_day','idx_briefs_onboarding_once','idx_one_active_onboarding',
                    'idx_koda_messages_conversation','idx_relationships_user','idx_koda_events_user_name',
                    'rate_limit_counters_window_idx','waitlist_email_key')
order by 1;

-- 3. Columns added to existing tables.
-- Expected: 12 rows (5 on profiles including contacts_notes, 7 on recruiting_moves).
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'profiles' and column_name in ('contacts_notes','recruiting_stage','timeline','proof_points','success_definition'))
    or (table_name = 'recruiting_moves' and column_name in ('brief_id','priority','effort','expected_outcome','source_status','effort_bucket','actual_effort_bucket')))
order by 1, 2;

-- 4. Waitlist lock-down: no insert policies, no anon/authenticated insert.
-- Expected: 0 | f | f
select (select count(*) from pg_policies where schemaname = 'public' and tablename = 'waitlist') as waitlist_policies,
       has_table_privilege('anon', 'public.waitlist', 'insert') as anon_can_insert,
       has_table_privilege('authenticated', 'public.waitlist', 'insert') as authenticated_can_insert;

-- 5. Rate-limit function execute rights.
-- Expected: f | f | f | t | t | f
--   (rate_limit_hit: anon, PUBLIC, authenticated denied; service_role allowed;
--    claim_brief_confirmation_email: authenticated allowed, anon denied)
select has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'execute') as anon_rate_limit_hit,
       has_function_privilege('public', 'public.rate_limit_hit(text,integer,integer)', 'execute') as public_rate_limit_hit,
       has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute') as auth_rate_limit_hit,
       has_function_privilege('service_role', 'public.rate_limit_hit(text,integer,integer)', 'execute') as service_rate_limit_hit,
       has_function_privilege('authenticated', 'public.claim_brief_confirmation_email(text)', 'execute') as auth_claim,
       has_function_privilege('anon', 'public.claim_brief_confirmation_email(text)', 'execute') as anon_claim;

-- 6. Existing data survived.
-- Expected: waitlist_rows = 30, profile_rows = 1 (the counts before the push).
select (select count(*) from public.waitlist) as waitlist_rows, (select count(*) from public.profiles) as profile_rows;

-- 7. SECURITY DEFINER functions pin an empty search_path.
-- Expected: 2 rows, prosecdef = t, proconfig = {"search_path=\"\""}
select proname, prosecdef, proconfig from pg_proc
where oid in ('public.rate_limit_hit(text,integer,integer)'::regprocedure, 'public.claim_brief_confirmation_email(text)'::regprocedure)
order by 1;

-- 8. Migration history.
-- Expected: 8 rows: 20260710000000, 20260710000001, 20260712, 20260713000000,
--   20260713010000, 20260713120000, 20260924000000, 20260924000001
--   (and no 20260712082646 / 20260712163330).
select version, name from supabase_migrations.schema_migrations order by version;

rollback;
