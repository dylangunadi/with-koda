-- Baseline privileges for the API roles. Hosted Supabase projects ship
-- these grants by default, but newer CLI local stacks do not, so a fresh
-- `supabase start` (local dev, CI) left every public table inaccessible to
-- anon/authenticated/service_role: Postgres grants are checked before RLS,
-- so even the service role got "permission denied". Idempotent and harmless
-- where the grants already exist. Row security still comes exclusively from
-- each table's RLS policies.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;

-- integration_tokens stays service-role-only: re-apply the defense-in-depth
-- revoke that the blanket grant above would otherwise undo. (RLS enabled
-- with zero policies already blocks anon/authenticated regardless; this
-- keeps the second layer intact.)
revoke all on integration_tokens from anon, authenticated;
