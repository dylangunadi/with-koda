# TODOS — Koda

## DONE: Talk to Koda MVP (guided first action)

Status: shipped on feat/talk-to-koda-onboarding (see docs/OVERNIGHT_REPORT.md)

Delivered: conversational onboarding at /talk (text + push-to-talk voice with
full text fallback), structured onboarding persistence with resume, review and
confirm with brief schedule choice, persisted first Koda Brief, honest move
action semantics (Accept / Mark completed / Save for later / Not relevant; Send
removed), ongoing Talk to Koda (relationship memory, profile-update proposals,
next-move recommendations), idempotent scheduled briefs, and koda_events
instrumentation. 20 Playwright tests cover the critical paths.

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
- [ ] Write first real Playwright test for sign-in flow
- [ ] Write Playwright test for waitlist form submission
- [ ] Add TypeScript types for Supabase client (generated or manual)
- [x] Remove `tests/example.spec.ts` (scaffold, tests playwright.dev not Koda)

## Next

- [ ] Write Playwright tests for: onboarding, move generation, move actions
- [ ] Add input validation (Zod) to API routes
- [ ] Add error monitoring (Sentry or equivalent)
- [ ] Configure `storageState` in Playwright for authenticated test reuse
- [ ] Add unit test framework (Vitest) for `lib/koda/` functions

## Later

- [ ] Parallelize autonomous brief cron (currently sequential)
- [ ] Add social auth providers (Google)
- [ ] Resolve `resume_text` / `experience_summary` duplication in profiles
- [ ] Add move deduplication across generations
- [ ] Rate limiting at middleware level (not just per-user DB query)
- [ ] Add CI environment variables for Playwright against staging

## Bugs

- [ ] No known bugs documented yet — needs systematic testing

## Product Questions

- [ ] Is the waitlist table still actively used alongside direct sign-up?
- [ ] Should autonomous briefs require email confirmation?
- [ ] What quality bar for move generation is acceptable for MVP launch?
- [ ] Target user count for cron scalability planning?
- [ ] Should profiles have a `company_size` field? (exists in schema code but not in migration SQL)
