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

## DONE: Sprint 2 — Talk to Koda feels real

Status: shipped on feat/talk-to-koda-onboarding (base for review: 816c1aa)

Delivered: fixed-viewport call interface (internal transcript scroll, anchored
controls, safe areas), conversational voice state machine (auto-listen, pause
turn detection, live interim transcript, interruptible sentence-streamed TTS,
low-confidence correction, honest mic indicator), streamed turns end to end
(optimistic user messages, instant clear with restore-on-failure, client turn
ids deduped server-side, turn_latency measurement), spoken-conversation prompt
rework (one short question, skips and corrections, contradiction clarification),
end-of-call summary explaining what Koda does with the data, calm collapsed and
expanded move cards with one dominant CTA, rejection reasons, and effort-bucket
calibration (predicted vs actual). validate.sh browser detection fixed;
scripts/smoke-live-provider.mjs added for live-key verification.

Remaining from the sprint's Priority 0 (require things this sandbox lacks):
- [ ] Run the live Anthropic provider end to end (node scripts/smoke-live-provider.mjs wherever ANTHROPIC_API_KEY exists)
- [ ] Run the real codex CLI review (needs OpenAI credentials; substitute reviews in .agent/reviews/)
- [x] Apply supabase/migrations/20260713120000_effort_buckets.sql (Dylan ran it in the SQL editor)

## PARKED: Voice-call onboarding (branch feat/voice-call-onboarding)

Product decision (2026-07-13): ship chat-first; the call experience is
overbuilt for the MVP. This branch is chat-only. The voice work lives on
feat/voice-call-onboarding: half-duplex mic (echo fix), tap-to-interrupt,
OpenAI TTS proxy (/api/voice/tts, needs OPENAI_API_KEY), call-first orb UI.
Known remaining work there: Playwright voice specs need updating for the new
call surface; real-mic and live-TTS verification.

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
- [ ] Turn-id dedup: add a partial unique index on (conversation_id, payload->>'turn_id') with a 23505 fetch-existing arm, plus a spec replaying an explicit turnId (review round 3, L1)
- [ ] Streamed-turn persistence edges: skip the duplicate user-row insert when the last user row already carries the same turn_id; speak deduped-retry replies during calls (review round 3, L2)
- [ ] Voice test depth (applies to feat/voice-call-onboarding only): fail-after-delta AI injection variant, hold-open delta gate, mid-stream disconnect spec (review round 3, L7)

## Later

- [ ] Parallelize scheduled brief cron (currently sequential)
- [ ] Add social auth providers (Google)
- [ ] Resolve `resume_text` / `experience_summary` duplication in profiles
- [ ] Stronger move deduplication across generations (prompts now carry recent board titles; no structural dedupe yet)
- [ ] Rate limiting at middleware level (not just per-user DB query)
- [ ] Add CI environment variables for Playwright against staging

## Bugs

- [x] Pre-existing migration filename ordering: resolved by renaming to `20260710000000_koda_mvp_schema.sql` / `20260710000001_koda_agentic_layer.sql` (caught by the new CI's fresh `supabase start`). Hosted projects that applied the old names need a one-time `supabase migration repair --status applied 20260710000000 20260710000001`.

## Product Questions

- [ ] Is the waitlist table still actively used alongside direct sign-up?
- [x] Should autonomous briefs require email confirmation? Answered: in-app scheduled briefs need only in-product consent; the email digest still requires the double-opt-in (see /api/briefs).
- [ ] What quality bar for move generation is acceptable for MVP launch?
- [ ] Target user count for cron scalability planning?
- [x] Should profiles have a `company_size` field? Stale question: `company_size` appears nowhere in code or SQL, only in this file.
