# TODOS — Koda

## DONE: Talk to Koda MVP (guided first action)

Status: shipped on feat/talk-to-koda-onboarding (see docs/OVERNIGHT_REPORT.md)

Delivered: conversational onboarding at /talk (text + push-to-talk voice with
full text fallback), structured onboarding persistence with resume, review and
confirm with brief schedule choice, persisted first Koda Brief, honest move
action semantics (Accept / Mark completed / Save for later / Not relevant; Send
removed), ongoing Talk to Koda (relationship memory, profile-update proposals,
next-move recommendations), idempotent scheduled briefs, and koda_events
instrumentation. 21 Playwright tests cover the critical paths.

## Analytics

Product events live in the `koda_events` table (see src/lib/koda/events.ts for
the event list and the strict no-user-content properties rule).

Activation = a user who completed onboarding, received a first brief, and took
at least one move action:

```sql
select count(*) from (
  select user_id from koda_events
  group by user_id
  having bool_or(event_name = 'onboarding_completed')
     and bool_or(event_name = 'first_brief_generated')
     and bool_or(event_name in ('move_accepted','move_rejected','move_saved','move_completed','move_edited'))
) activated;
```

Funnel rates: compare distinct-user counts of `onboarding_started`,
`onboarding_completed`, `first_brief_generated`, and any `move_*` event.

## Now

- [x] Configure Playwright `baseURL` and `webServer` in `playwright.config.ts`
- [x] Write first real Playwright test for sign-in flow (signup + sign-in exercised across `tests/`)
- [ ] Write Playwright test for waitlist form submission
- [ ] Add TypeScript types for Supabase client (generated or manual)
- [x] Remove `tests/example.spec.ts` (scaffold, tests playwright.dev not Koda)
- [ ] Verify the live Anthropic provider end to end (sandbox had no API key; offline provider covered everything else)

## Next

- [x] Write Playwright tests for: onboarding, move generation, move actions
- [ ] Add input validation (Zod) to API routes
- [ ] Add error monitoring (Sentry or equivalent)
- [ ] Configure `storageState` in Playwright for authenticated test reuse
- [ ] Add unit test framework (Vitest) for `lib/koda/` functions
- [ ] Enforce koda_events RLS so browsers cannot write events directly (whitelist lives in /api/events; today a user can only pollute their own rows)

## Later

- [ ] Parallelize scheduled brief cron (currently sequential)
- [ ] Add social auth providers (Google)
- [ ] Resolve `resume_text` / `experience_summary` duplication in profiles
- [ ] Stronger move deduplication across generations (prompts now carry recent board titles; no structural dedupe yet)
- [ ] Rate limiting at middleware level (not just per-user DB query)
- [ ] Add CI environment variables for Playwright against staging

## Bugs

- [ ] Pre-existing migration filename ordering: `20260710_koda_agentic_layer.sql` sorts before `20260710_koda_mvp_schema.sql` but depends on it, so a fresh `supabase db reset` fails. Apply in dependency order, or rename (renaming already-applied production migrations has its own risks).

## Product Questions

- [ ] Is the waitlist table still actively used alongside direct sign-up?
- [x] Should autonomous briefs require email confirmation? Answered: in-app scheduled briefs need only in-product consent; the email digest still requires the double-opt-in (see /api/briefs).
- [ ] What quality bar for move generation is acceptable for MVP launch?
- [ ] Target user count for cron scalability planning?
- [x] Should profiles have a `company_size` field? Stale question: `company_size` appears nowhere in code or SQL, only in this file.
