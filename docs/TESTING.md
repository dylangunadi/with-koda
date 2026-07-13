# Testing — Koda

## Test Stack

- **E2E / Browser**: Playwright (`@playwright/test`), chromium project
- **Unit / Integration**: None configured yet (no Jest/Vitest)
- **Config**: `playwright.config.ts` (baseURL `http://localhost:3000`, auto-starts `npm run dev` with `KODA_AI_MOCK=1`)

## Running Tests

```bash
# All Playwright tests
npx playwright test --project=chromium

# Specific test file
npx playwright test tests/onboarding-conversation.spec.ts --project=chromium

# Critical E2E only (@critical tag)
bash scripts/e2e-critical.sh

# Full validation (lint + types + build + tests)
bash scripts/validate.sh
```

In environments that cannot download the pinned Chromium build, point at a cached one:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npx playwright test --project=chromium`
(the config hook is a no-op when the variable is unset).

## Current Test Files

| File | Purpose |
|------|---------|
| `tests/onboarding-conversation.spec.ts` | @critical — signup routes into Talk to Koda, full text onboarding, mid-flow reload resume, structured persistence, review edits, first brief of 3 moves |
| `tests/returning-user.spec.ts` | @critical — onboarded users bypass onboarding, see the saved brief and move states, `/talk` opens the ongoing conversation |
| `tests/move-actions.spec.ts` | @critical — Complete (with actual-effort bucket) / Save / Not relevant (with optional reason) persist across reloads into the right tabs; no Send or Accept affordances; API rejects `sent`; draft edits |
| `tests/onboarding-voice.spec.ts` | Call machine: auto-detected turns with TTS, barge-in interruption, mute honesty, low-confidence correction, mic denial, no-support fallback, optimistic streaming, mic release on client-side navigation away |
| `tests/onboarding-errors.spec.ts` | AI failure preserves input and permits retry; duplicate submission, repeated confirm, and repeated generation idempotency |
| `tests/ongoing-talk.spec.ts` | Relationship capture with confirm/decline, goal-update diffs, next-move recommendations |
| `tests/cron-brief.spec.ts` | Scheduled brief idempotency, consent gating, manual users untouched, secret rejection (serial) |
| `tests/settings-briefs.spec.ts` | Profile edits never revoke scheduled-brief consent; enable/disable round-trips |
| `tests/instrumentation.spec.ts` | Activation event trail exists; no user content leaks into event properties |
| `tests/helpers/` | `env.ts` (.env.local parsing), `db.ts` (service-role seeding/assertions, refuses non-local Supabase), `auth.ts` (UI login/signup), `speech.ts` (deterministic SpeechRecognition + speechSynthesis fakes with turn/interrupt controls) |

## Test Data

- Tests create unique users per run (`uniqueEmail()`); seeded users default to `manual` brief frequency so the cron spec never touches them
- `seedOnboardedUser()` creates a profile, an onboarding brief, and three moves directly via the service role
- `tests/helpers/db.ts` refuses to run against a non-local Supabase URL unless `KODA_ALLOW_REMOTE_TEST_DB=1` — never point tests at production
- Local signups get sessions immediately (`enable_confirmations = false` in `supabase/config.toml`)

## AI in Tests

- The Playwright web server pins `KODA_AI_MOCK=1`, so specs run against the deterministic offline provider and never call the live model. If you reuse an already-running dev server, start it with `KODA_AI_MOCK=1` yourself.
- AI failures are injected with the `x-koda-test-ai: fail` header (honored only in mock mode outside production; it can only cause failures). `/api/talk` streams; specs that parse it directly read the last `data:` frame.
- Real Web Speech does not run in headless Chromium; `tests/helpers/speech.ts` installs a scriptable fake so the app's real state machine (and real feature detection) is exercised.

## Authentication in Browser Tests

- Specs authenticate through the real UI (`loginViaUi` / `signupViaUi` in `tests/helpers/auth.ts`)
- No committed auth state; `playwright/.auth/` stays gitignored if you add `storageState` later

## Debugging

```bash
npx playwright test --headed        # browser visible
npx playwright test --debug         # step-through
npx playwright show-report          # last HTML report
npx playwright show-trace test-results/<test-name>/trace.zip
```

Failed tests leave an `error-context.md` page snapshot in `test-results/<test-name>/`.

## Artifacts

| Artifact | Location | Gitignored |
|----------|----------|------------|
| HTML report | `playwright-report/` | Yes |
| Test results + traces + failure screenshots | `test-results/` | Yes |
| Evidence screenshots (committed intentionally) | `docs/screenshots/` | No |

## Playwright Configuration Notes

- `testDir`: `./tests`
- `fullyParallel`: true (local), `workers: 1` on CI; `tests/cron-brief.spec.ts` self-serializes
- `retries`: 0 (local), 2 (CI)
- `reporter`: HTML; `trace`: on-first-retry; `screenshot`: only-on-failure
- `baseURL`: `http://localhost:3000`
- `webServer`: `npm run dev` with `KODA_AI_MOCK: "1"`, reused locally
