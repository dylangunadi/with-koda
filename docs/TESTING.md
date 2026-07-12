# Testing — Koda

## Test Stack

- **E2E / Browser**: Playwright (`@playwright/test`)
- **Unit / Integration**: None configured yet (no Jest/Vitest)
- **Config**: `playwright.config.ts`

## Running Tests

```bash
# All Playwright tests (chromium, firefox, webkit)
npx playwright test

# Single browser
npx playwright test --project=chromium

# Specific test file
npx playwright test tests/example.spec.ts

# Headed mode (see the browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Critical E2E only
bash scripts/e2e-critical.sh

# Full validation
bash scripts/validate.sh
```

## Current Test Files

| File | Status | Purpose |
|------|--------|---------|
| `tests/example.spec.ts` | Scaffold | Default Playwright example (visits playwright.dev) |
| `tests/seed.spec.ts` | Scaffold | Empty test group placeholder |

Both are scaffolds from `npx playwright init` and do not test Koda functionality.

## Test Data

- No test seed data exists yet
- For Supabase tests, create test users via `supabase.auth.signUp()` in test setup
- Clean up test data in `afterAll` or use unique identifiers per test run
- Never use production credentials or real user data in tests

## Authentication in Browser Tests

- Playwright tests should authenticate by:
  1. Navigating to `/login`
  2. Filling email/password form
  3. Submitting and waiting for redirect
- Store auth state in `playwright/.auth/` (gitignored)
- Use Playwright's `storageState` for session reuse across tests
- The `baseURL` should be set to `http://localhost:3000` when using with dev server

## Critical User Flows (to be tested)

1. **Sign up + onboarding**: Create account, complete 4-step wizard, land on inbox
2. **Sign in**: Existing user signs in, redirects to inbox
3. **Generate moves**: Click "Run Koda", see 3 new moves appear
4. **Move actions**: Accept, reject, save, mark sent on a move
5. **Edit draft**: Expand move, edit outreach draft, save
6. **Settings**: Update profile fields, save changes
7. **Waitlist**: Submit waitlist form on landing page

## Debugging

```bash
# Run with browser visible
npx playwright test --headed

# Step-through debugger
npx playwright test --debug

# View last test report
npx playwright show-report

# View trace from failed test
npx playwright show-trace test-results/<test-name>/trace.zip
```

## Artifacts

| Artifact | Location | Gitignored |
|----------|----------|------------|
| HTML report | `playwright-report/` | Yes |
| Test results | `test-results/` | Yes |
| Traces | `test-results/*/trace.zip` | Yes |
| Screenshots | `test-results/*/` | Yes |
| Auth state | `playwright/.auth/` | Yes |
| Blob report | `blob-report/` | Yes |

## Playwright Configuration Notes

- `testDir`: `./tests`
- `fullyParallel`: true (local), sequential on CI (`workers: 1`)
- `retries`: 0 (local), 2 (CI)
- `reporter`: HTML
- `trace`: on-first-retry
- `baseURL`: not configured (should be set for app tests)
- `webServer`: commented out (should be enabled for app tests)
