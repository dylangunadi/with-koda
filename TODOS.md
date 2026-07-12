# TODOS — Koda

## NOW: Guided first action

Status: ready

Goal:
A new user completes one meaningful Koda action within three minutes.

Acceptance criteria:
- New user sees one obvious primary action.
- The flow has loading, empty and error states.
- User input survives a failed AI request.
- Completing the action updates relationship state.
- Relevant Playwright test passes.
- scripts/validate.sh passes.

Out of scope:
- New contact-management system
- Broad dashboard redesign
- Changes to unrelated workflows

Validation:
- [ ] Running app exercised
- [ ] Targeted Playwright test
- [ ] Full validation
- [ ] Codex review
- [ ] Preview manually inspected

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
