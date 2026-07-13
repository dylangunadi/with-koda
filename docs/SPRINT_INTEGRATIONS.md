# Koda Sprint Plan: Integration & Agentic Action Foundation

## Context

Koda today is a complete but self-contained loop: conversational onboarding builds a structured profile, Koda generates 3-move briefs (manual "Run Koda" + daily cron), users act on move cards, and feedback flows into future generations. But every move is `ai_suggested` — grounded only in what the user typed. This sprint builds the integration and agentic-action foundation (Google Calendar first, verified job boards second, Gmail architecture prepared for next sprint) so Koda's moves become grounded in real meetings, real people the user actually knows, and real live job postings — turning Koda from a good onboarding experience into an opportunity-to-action agent. The target feeling: *"I was away, Koda worked, and I came back to grounded moves, drafts, and prep briefs ready for review."*

## Process & Git Hygiene (per Dylan's request)

- **Branch**: create `feat/initial-integrations` from `main` (explicitly requested, overriding the default session branch). All sprint work happens there; no pushes to `main`.
- **Co-authorship**: every commit ends with `Co-authored-by: Dylan Gunadi <dylan_gunadi@berkeley.edu>`.
- **Style**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`) matching repo history; small focused commits per milestone.
- **First commit on the branch**: this plan, committed as `docs/SPRINT_INTEGRATIONS.md` (docs/ holds flat uppercase docs; specs/ is test plans only), then pushed with `git push -u origin feat/initial-integrations`. No implementation until the plan is committed.

---

## 1. Repository Findings (verified from code)

**Stack**: Next.js 16 App Router, React 19, TS strict, Tailwind 4 + shadcn (base-nova), Supabase (`@supabase/ssr`), `@anthropic-ai/sdk` (claude-sonnet-4-5), Resend, Vercel (1 cron: `/api/cron/brief` @ 8AM UTC). No ORM, no Zod, no unit-test framework — Playwright only, against real local Supabase, with `KODA_AI_MOCK=1` deterministic AI provider.

**Auth**: Supabase email+password only. **No OAuth of any kind exists anywhere.** API routes use `supabase.auth.getUser()` + RLS (`auth.uid() = user_id`); privileged routes (cron, brief confirm, waitlist) use `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` bearer.

**Database** (6 migrations): `profiles` (rich recruiting profile + brief scheduling w/ double-opt-in), `recruiting_moves` (5 types; statuses generated/accepted/saved/completed/rejected — `sent` rejected by API by design; `source_status` default `ai_suggested`), `move_events`, `briefs` (unique partial indexes give cron idempotency: one onboarding brief ever, one scheduled per user/day), `koda_conversations` (`extracted` jsonb = profile source of truth), `koda_messages`, `relationships` (real people w/ verbatim `source_message` provenance), `koda_events` (privacy-safe analytics: ids/enums/counts only). **No tables for tokens, integrations, external sources, opportunities, emails, or calendar.**

**AI layer**: `KodaAI` interface (`src/lib/koda/ai/provider.ts`) — `anthropic.ts` (streaming reply-first `<<<DATA>>>` sentinel, prompt-based JSON + whitelist sanitizers) + `mock.ts` (deterministic offline, selected by `KODA_AI_MOCK=1`/missing key). Context: `buildAgentContext()` (`src/lib/koda/agentContext.ts`: last 50 moves + feedback boost/reduce patterns + effort calibration + 20 relationships) → `buildUserPrompt()` (`src/lib/koda/prompts.ts`: profile + KNOWN RELATIONSHIPS capped 10 + recent titles for dedup + AGENT MEMORY). Exactly 3 sanitized moves per brief; real names allowed only from the relationships block.

**Key flows & seams**:
- Onboarding: `/talk` → server-authoritative 9-field checklist (`src/lib/koda/onboarding.ts`) → `ReviewConfirm` modal (`src/components/talk/TalkToKoda.tsx:322-342`) → `confirmOnboarding` (`src/app/talk/actions.ts`: upsert profile + close conversation + first brief) → `/inbox`.
- Manual run: `POST /api/moves/generate` (2-min rate limit). Cron: claim-first via unique index, delete claim on failure, sequential, digest email only when double-opt-in confirmed.
- Inbox: `InboxTabs` (Today/Saved/Completed/Not relevant) + `MoveCard` (Mark completed w/ effort calibration, Save, Not relevant w/ reason, editable `outreach_draft`; **no Send affordance anywhere — enforced: API rejects `sent`**). Source labels already render from `SOURCE_LABELS[move.source_status]` (`MoveCard.tsx:35, 287`).
- Settings: profile + brief scheduling only. **No integrations UI, no data-deletion UI exists.**

**Testing**: 9 Playwright specs (onboarding, returning-user, move-actions, errors, ongoing-talk, cron-brief, settings, instrumentation, auth-callback); helpers refuse remote Supabase; failure injection via `x-koda-test-ai: fail` (mock + non-prod only). `scripts/validate.sh` = lint + tsc + build + Playwright = Definition of Done; same in GitHub Actions CI. Prod Supabase (`recruit-crm`) vs staging (`koda-staging`) for previews.

**Guardrails** (AGENTS.md / docs): never weaken RLS, never bypass auth, never commit `.env*`; Koda never sends messages, never auto-applies, never fabricates named people. Known bug to not repeat: migration filename ordering (`20260710_koda_agentic_layer.sql` sorts before its dependency).

## 2. Current Architecture Summary

Per-user-row Supabase model with strict RLS; server components fetch directly; client components mutate via REST routes; all AI behind one provider interface with a deterministic mock twin; all generation converges on `insertBriefWithMoves`; all agent memory converges on `buildAgentContext` → `buildUserPrompt`; all background work uses claim-first idempotency. The integration layer mirrors these exact patterns: adapter interface + mock twin (`KODA_INTEGRATIONS_MOCK=1`), one sync engine writing normalized `external_*` tables, one context-assembly extension, RLS everywhere, service-role only where cron demands it.

## 3. Recommended Primary Vertical Slice

**Primary: Google Calendar → grounded prep/follow-up moves** (the one complete real loop):

> Connect Google Calendar (read-only) → nightly + manual sync into `external_events` → deterministic classification (coffee chat / recruiter call / interview / deadline) → events flow into agent context with provenance refs → Koda generates a **prep move before** an upcoming chat and a **follow-up move after** a recent one, linked to the real event, labeled *verified*, with source link → user acts via existing feedback machinery → next brief deduplicates and reflects calibration.

**Why Calendar over Gmail first** (the four criteria):
- **Repo readiness**: the downstream half (context assembly, prompts, briefs, move cards, feedback, cron idempotency) already exists and is tested. Calendar needs only the upstream half (OAuth + sync + normalize). Gmail needs that plus email-body content-safety handling.
- **Product value**: recruiter calls and interviews are the highest-stakes moments Koda can help with; prep/follow-up maps 1:1 onto existing `follow_up`/`person_to_contact` move types, and attendees are real named people from the user's own data — consistent with the no-fabrication rule.
- **Implementation risk**: `calendar.readonly` is a *sensitive* Google scope (brand verification only). Gmail scopes are *restricted* (CASA security assessment, weeks–months). Additionally, in OAuth "Testing" mode Google expires refresh tokens after 7 days — survivable for Calendar with good reconnect UX while verification is pending; brutal for a Gmail-first slice. And `gmail.metadata` is no shortcut: it's restricted *and* forbids bodies and search, so it can't power thread import or reply drafts anyway.
- **Testing feasibility**: calendar fixtures relative to "today" are trivially deterministic; Gmail mock fidelity (threads, MIME) is much harder.

**Secondary slice, partially in-sprint: Greenhouse/Lever verified opportunities.** Public unauthenticated JSON APIs (`boards-api.greenhouse.io/v1/boards/{token}/jobs`, `api.lever.co/v0/postings/{company}?mode=json`) — zero OAuth, real `updated_at`/URL/freshness metadata. It validates the adapter + normalization + dedup + freshness machinery with a second provider (exactly as far as the abstraction needs to go, no further) and is the hedge if Google credentials stall. Honest framing required: "companies with public Greenhouse or Lever boards," with paste-a-board-URL fallback (many targets use Ashby/Workday). The full Opportunity Workspace is deferred (§5).

## 4. Explicit Sprint Scope

1. **Integration foundation**: `integrations` / `integration_tokens` (encrypted, policy-less RLS) / `integration_sync_runs` tables; AES-256-GCM crypto module; server-only token lifecycle; provider adapter interfaces + deterministic mock adapters; sync engine with claim-first idempotency.
2. **Google Calendar end-to-end**: OAuth (state + PKCE) connect/callback/disconnect; incremental sync via `syncToken` (410 → bounded full resync); event classification; relationship matching by attendee email; grounded prep/follow-up moves with server-enforced provenance; daily sync cron before the brief cron.
3. **Verified opportunities**: Greenhouse + Lever adapters; board config derived from `target_companies` + user-confirmed URLs; `external_opportunities` with live/stale/closed verification transitions; OP-grounded opportunity moves with source URL + fetched-at.
4. **Trust surfaces**: `/settings/integrations` (status, plain-language scope disclosure, Sync now, Disconnect-with-deletion); post-first-brief `ConnectPrompt` recommendation card in `/inbox`; MoveCard verified badge + "View source ↗" + freshness.
5. **Test infrastructure**: `KODA_INTEGRATIONS_MOCK=1` mock OAuth + adapters; Vitest for pure logic (already on TODOS.md); 8 new Playwright flows; validate.sh gains vitest step.
6. **Docs**: ARCHITECTURE/PRODUCT/TESTING/AGENTS updates (incl. token-handling rule: tokens only via `integrations/tokens.ts`, never client-side, never logged).

## 5. Explicit Non-Goals (this sprint)

- **Gmail implementation** (architecture accommodates it; Google verification/CASA paperwork starts now; build next sprint).
- Opportunity Workspace surface, application packets, structured proof-of-work plan builder, LinkedIn outreach workflow (drafts continue to live on moves).
- Sending anything, creating/modifying calendar events, Gmail draft creation, auto-apply — no push capability exists in the adapter interfaces *by construction*.
- LinkedIn scraping or automation of any kind; inventing named people.
- Global (cross-user) opportunity cache; typed Supabase client migration; Zod adoption beyond new routes; parallelized cron.

## 6. User Flows

1. **Connect (recommended, not forced)**: user lands on first brief in `/inbox` → dismissible ConnectPrompt recommends *one* integration based on `recruiting_stage`/`timeline` ("You're actively interviewing — connect Google Calendar so Koda can prep you before recruiter calls") with plain-language trust copy: read-only; Koda never sends email or creates events; disconnect deletes everything imported → Connect → Google consent → back to `/settings/integrations?connect=ok`, initial sync runs → next brief contains an event-grounded move. *(Placement rationale: `confirmOnboarding` is a carefully sequenced conversion moment ending in the first brief; inserting an OAuth roundtrip — with Google's "unverified app" warning during Testing mode — before the user has seen value is the wrong trade. Post-first-brief, the recommendation is also better grounded.)*
2. **Cancel**: user hits "Cancel" on Google consent → `?error=access_denied` → calm notice, zero rows written.
3. **Sync & reconnect**: nightly cron syncs stale-first; manual "Sync now" (rate-limited). Expired/revoked grant → status `error`, calm "Reconnect Google Calendar" card (a *normal* state during Testing mode's 7-day token expiry, not an error dead-end).
4. **Boards**: settings lists guessed boards for `target_companies` (validated with one live fetch) → user confirms or pastes a board URL → sync → verified opportunity moves appear with live source links.
5. **Grounded moves**: MoveCard shows "Verified source · checked 2h ago · View source ↗" and an event date chip; complete/save/reject flows unchanged; completed prep move suppresses duplicates for the same event.
6. **Disconnect & delete**: settings → Disconnect → confirm dialog stating imported data will be deleted → token revoked at Google (best-effort), integration row deleted, cascade removes tokens/events/opportunities; existing moves keep their copied `source_url` but lose live freshness chips.
7. **No integrations / partial integrations**: everything continues to work exactly as today; briefs simply have no verified blocks.

## 7. Integration & OAuth Strategy

- **Routes** (all server-side, Node runtime): `GET /api/integrations/google/connect` (session-auth; state nonce + PKCE verifier in short-lived HMAC-signed httpOnly SameSite=Lax cookies; scopes `openid email calendar.readonly`, `access_type=offline`, `prompt=consent`); `GET /api/integrations/google/callback` (verify state; handle `access_denied`; exchange code; fetch userinfo email for `account_label`; **verify granted scopes** — users can uncheck; upsert `integrations` via user client, encrypted tokens via service-role into `integration_tokens`; inline initial sync; redirect to settings); `POST /api/integrations/google/disconnect` (best-effort Google revoke → delete integration row → cascade); `POST /api/integrations/sync` (manual, 2-min rate limit); `POST/DELETE /api/integrations/boards`.
- **Token lifecycle** (`src/lib/koda/integrations/tokens.ts`, `import "server-only"`): `getValidAccessToken()` decrypts, refreshes when <120s to expiry, persists rotated tokens; `invalid_grant` → `status='error'`, `last_sync_error='reconnect_required'`.
- **Encryption**: app-level AES-256-GCM with `KODA_TOKEN_ENC_KEY` (32-byte base64, per-env; rotation = users reconnect). *Not* pgsodium (deprecated by Supabase for new use).
- **Mock mode**: `KODA_INTEGRATIONS_MOCK=1` (or missing Google creds) → registry returns mock adapters; `/connect` short-circuits to callback with `code=mock`; failure injection via `x-koda-test-integration: fail` (mock + non-prod only) — all mirroring the proven `KODA_AI_MOCK` pattern.
- **Adapters** (pull-only interfaces — no push methods exist, so "never contacts anyone" is structural): `CalendarSource.pullEvents({accessToken, cursor, windowStart, windowEnd})` and `OpportunitySource.pullPostings({boardToken, company})`; adapters never touch token storage (sync engine injects tokens).

## 8. Data Model Changes

Two migrations with full future-dated timestamps (sorting after all existing files — avoids repeating the `20260710_*` ordering bug):

**`supabase/migrations/20260714000000_integrations_core.sql`**
- `integrations`: `user_id`, `provider` ('google_calendar' | 'job_boards'; later 'gmail'), `status` ('connected'|'error'|'pending'), `account_label`, `scopes text[]`, `config jsonb` (calendar_ids; boards list), `sync_cursor` (Google syncToken), `last_synced_at`, `last_sync_error`; unique `(user_id, provider)`; standard four own-row RLS policies.
- `integration_tokens`: `integration_id` PK → integrations cascade, `user_id`, `access_token_enc`, `refresh_token_enc` (AES-256-GCM `iv.ct.tag`), `access_token_expires_at`. **RLS enabled with ZERO policies + `revoke all from anon, authenticated`** — browser can never read a token byte; only service-role. A policy-less side table beats column privileges (PostgREST footgun) and survives future policy mistakes on `integrations`.
- `integration_sync_runs`: `integration_id`, `trigger` ('scheduled'|'manual'|'initial'), `run_date`, `status`, `stats jsonb` (counts only, per koda_events privacy convention), `error`; **unique partial index `(integration_id, run_date) where trigger='scheduled'`** — cron idempotency mirroring `idx_briefs_scheduled_once_per_day`; own-row select-only RLS (settings observability), writes service-role.
- `profiles.integrations_prompt_dismissed_at timestamptz` (ConnectPrompt dismissal).

**`supabase/migrations/20260714010000_external_records.sql`**
- `external_events`: `integration_id`, `provider`, `external_id`, `title`, `description_snippet` (truncated ≤500 chars at write), `start_at`/`end_at`, `location`, `attendees jsonb` `[{name,email}]`, `organizer_email`, `html_link` (source URL), `event_status` ('confirmed'|'cancelled' — cancelled updated, never hard-deleted: moves may link), `classification` ('coffee_chat'|'recruiter_call'|'interview'|'deadline'|'other'), `relationship_id → relationships on delete set null`, `source_updated_at`, `fetched_at`; **unique `(user_id, provider, external_id)`** dedup; index `(user_id, start_at)`; own-row RLS.
- `external_opportunities`: `provider` ('greenhouse'|'lever'), `board_token`, `external_id`, `company`, `title`, `location`, `department`, `absolute_url` (required), `source_posted_at`, `source_updated_at`, `first_seen_at`, `last_seen_at`, `fetched_at`, `verification_status` ('verified_live'|'stale'|'closed'); **unique `(user_id, provider, board_token, external_id)`** dedup; own-row RLS. Per-user rows (a global cache is premature at current scale and complicates RLS + disconnect deletion).
- `recruiting_moves` additions: `external_event_id` / `external_opportunity_id` (both `on delete set null` — completed moves are the user's history), `source_url text`, `source_fetched_at timestamptz` (copied at insert so provenance display never dangles after disconnect).

## 9. Agent-Context Changes

- **`AgentContext` additions** (`src/lib/types.ts`, `agentContext.ts`): `calendar.upcoming` (next 14 days, max 8, classified, cancelled excluded), `calendar.recent_past` (last 7 days, max 4, only events lacking a linked non-rejected move), `opportunities` (verified_live only, max 8, target-company matches first then newest). Bounds enforced at query (`limit`) and serialization (title ≤120, snippet ≤300) — bounded model context by construction, tunable in one function.
- **Prompt blocks** (`buildUserPrompt`): `VERIFIED CALENDAR` (real events, real attendee names the model MAY use — same trust class as user-provided data) and `VERIFIED OPENINGS` ("live on official boards as of {date}; never invent openings beyond these"), each item carrying a stable ref (`[EV1]`, `[OP1]`).
- **`MOVE_GENERATOR_SYSTEM_PROMPT`**: moves built on a ref MUST emit `source_ref` and `source_status: "verified"`; `verified` without a valid ref forbidden; events already carrying a move are off-limits. `GeneratedMove` gains `source_ref?`.
- **Server-side enforcement** (the real guarantee, consistent with the sanitizer philosophy): post-pass in `generateRecruitingMoves.ts` resolves `source_ref` against actual context — valid → set FK + copy `source_url`/`source_fetched_at`; invalid/missing with `verified` claimed → **downgrade to `ai_suggested` and strip**. Deterministic dedup belt: drop generated moves whose resolved event already has a non-rejected move. `MoveSourceStatus` gains `"verified"`; `insertBriefWithMoves` + cron inline insert persist the new columns.
- **Mock AI** (`ai/mock.ts`): when context contains EV/OP items, deterministically emit one event-grounded prep move + one opportunity-grounded move — this makes the full loop Playwright-assertable.

## 10. API & Background-Job Boundaries

- New cron `GET /api/cron/sync` in `vercel.json` at `0 7 * * *` — **one hour before the brief cron**, so scheduled briefs always see fresh data. `CRON_SECRET` bearer + service-role, exactly like `/api/cron/brief`.
- Iterates `status='connected'` integrations stale-first (`last_synced_at` nulls first), **capped at 50/run** with `export const maxDuration = 300`; next run picks up the remainder. Per-integration claim via the sync-runs unique index; per-integration failure isolation (record error, continue); auth failure flips status to `error`.
- Safety boundaries: adapters pull-only; cron writes only `external_*` + run rows — no code path from background execution to outbound contact. Board fetches: 10s timeout + defensive JSON parsing (upstream drift → failed run, never a crash). `/api/cron/brief` unchanged except persisting new move columns.

## 11. Frontend Surfaces

- **`/settings/integrations`** (new page + link in `settings/layout.tsx`): per-provider `IntegrationCard` — status (connected / reconnect needed / not connected), account label, plain-language scope disclosure, Connect / Sync now / Disconnect (confirm dialog: "this deletes imported data"), last-synced time; `JobBoardsManager` — guessed boards from `target_companies` + paste-URL fallback + per-board remove.
- **`ConnectPrompt`** card atop `/inbox`: one recommended integration, goal-derived copy, trust disclosure, dismissible (persisted).
- **`MoveCard`**: extend the existing source-label row (`MoveCard.tsx:287`) — `verified` gets a distinct badge + "View source ↗" (`source_url`) + "checked {relative fetched_at}"; event-linked moves get a date/time chip. Stale data is *shown as stale*, never hidden.
- **Deferred**: Opportunity Workspace — this sprint ships its atoms (verified records, source links, move linkage); the surface earns its existence next sprint when outreach + proof-of-work + packets exist to aggregate.

## 12. Source & Trust Model

`source_status` becomes the single provenance axis on every move: `user_provided` (from what you told Koda) / `inferred` (from your profile) / `ai_suggested` (Koda's strategy idea) / **`verified` (new: backed by a live external record with URL + fetched-at)**. Imported-but-not-externally-verified data (calendar attendees, imported relationships) is treated as user-owned context, labeled accordingly in prompt blocks. Rules enforced in code, not prose: verified requires a resolvable ref (else downgraded); real names only from relationships + the user's own calendar attendees; opportunities only from fetched postings; freshness always displayed; no send/create/apply capability exists in any adapter or route.

## 13. Security & Privacy Risks

- **Token theft** → policy-less RLS side table + `revoke all` + AES-256-GCM at rest + server-only module + never logged; Playwright asserts an authed client reads zero token rows.
- **OAuth CSRF/code injection** → state nonce + PKCE + HMAC-signed httpOnly cookies; open-redirect-safe relative redirects (matches existing `auth/callback` discipline).
- **Scope creep** → request only `calendar.readonly` + identity; verify granted scopes at callback; disclose in UI copy.
- **Email/body content sensitivity** → deferred with Gmail; calendar `description_snippet` truncated at write; `koda_events`/`sync_runs.stats` stay ids/enums/counts only.
- **Cross-user leakage** → RLS on every new table; cron service-role writes scoped per-integration row.
- **Deletion honesty** → disconnect = cascade delete of everything imported; copy states exactly what survives (the user's own moves, with dead links noted).
- **Prod safety during dev** → local Supabase + `KODA_ALLOW_REMOTE_TEST_DB` guard already enforce this; staging project for previews; no prod credentials in this work.

## 14. Files to Add / Modify

**Add**: `supabase/migrations/20260714000000_integrations_core.sql`, `20260714010000_external_records.sql`; `src/lib/koda/integrations/{types,registry,crypto,tokens,sync,classify}.ts`, `google/{oauth,calendar}.ts`, `jobs/{greenhouse,lever,boards}.ts`, `mock/{calendar,jobs}.ts`; `src/app/api/integrations/google/{connect,callback,disconnect}/route.ts`, `api/integrations/{sync,boards}/route.ts`, `api/cron/sync/route.ts`; `src/app/settings/integrations/page.tsx`; `src/components/integrations/{IntegrationCard,JobBoardsManager}.tsx`, `src/components/ConnectPrompt.tsx`; `tests/{integrations-connect,integrations-sync,grounded-moves}.spec.ts`; `src/lib/koda/integrations/__tests__/*.test.ts`, `vitest.config.ts`; `docs/SPRINT_INTEGRATIONS.md` (this plan).

**Modify**: `src/lib/types.ts` (MoveSourceStatus + AgentContext + RecruitingMove + new interfaces), `src/lib/env.ts` (Google creds, enc key getters), `src/lib/koda/agentContext.ts`, `src/lib/koda/prompts.ts`, `src/lib/koda/ai/{provider,anthropic,mock}.ts`, `src/lib/koda/generateRecruitingMoves.ts` (ref-resolution post-pass), `src/lib/koda/briefs.ts`, `src/app/api/cron/brief/route.ts` (new columns), `src/components/MoveCard.tsx`, `src/app/inbox/page.tsx`, `src/app/settings/layout.tsx`, `vercel.json`, `scripts/validate.sh` (+vitest), `package.json`, `.env.example`, `docs/{ARCHITECTURE,PRODUCT,TESTING}.md`, `AGENTS.md` (token-handling rule).

## 15. Migration Strategy

Future-dated 14-digit timestamps sorting after every existing file (the `20260710_*` ordering bug stays quarantined). Both migrations are purely additive (new tables, `add column if not exists`) — zero risk to existing rows; no backfill needed (`source_status` default stands; new columns null for historical moves). Apply order: local `supabase db reset` in dev → staging project → prod only at ship time with Dylan's approval (per CLAUDE.md rule). Rollback = drop new tables/columns; nothing existing depends on them until M4 wires generation.

## 16. Testing Strategy

- **Vitest (new, in-scope — already on TODOS.md)**: node env, no jsdom, scoped to `src/lib/koda/**`. Targets: crypto roundtrip + tamper detection; syncToken paging + 410 full-resync; GH/Lever/GCal fixture → normalized-record mapping; classifier; `source_ref` resolution incl. verified-without-ref downgrade; dedup belt; board-token guessing; stale/closed transitions. Added to `validate.sh` between tsc and build.
- **Playwright** (mock adapters via `KODA_INTEGRATIONS_MOCK=1` in test env + existing `KODA_AI_MOCK=1`):
  1. Connect happy path — settings → Connect → mock consent → connected card + initial sync; admin client asserts encrypted token rows exist **and an authed client selecting `integration_tokens` returns zero rows (RLS proof)**.
  2. OAuth cancel — `error=access_denied` → notice, zero rows.
  3. Expired token / reconnect — seeded expired token + forced refresh failure → status error, reconnect banner, no crash.
  4. Duplicate sync idempotency — `/api/cron/sync` twice → stable `external_events` count, second claim skipped.
  5. Disconnect + deletion — tokens/events/opportunities gone; linked moves keep `source_url`, FK null.
  6. **Grounded move loop (the money test)** — seeded user + mock calendar → Run Koda → Verified badge, source link, event chip; complete; regenerate → no duplicate prep move for that event.
  7. Boards — add company → verified opportunity move with live URL; remove board → records deleted.
  8. Cron auth — `/api/cron/sync` without bearer → 401. Plus: user with no integrations sees today's behavior unchanged (covered by the existing 9 specs staying green).
- **Manual**: one real-Google E2E on staging per milestone (consent screens can't be Playwright'd), documented in `docs/TESTING.md`.
- **Review**: independent code review (`scripts/codex-review.sh` or `/code-review`) before merge; `validate.sh` + CI green is the Definition of Done per repo rules.

## 17. Implementation Milestones

- **M1 — Foundation (d1–3)**: migrations, crypto, tokens module, env getters, Vitest wiring. *AC*: clean `supabase db reset`; RLS-isolation assertion green; crypto/normalization unit tests green; `validate.sh` green. *Parallel*: create Google Cloud project + Testing consent screen + per-env OAuth clients.
- **M2 — OAuth + Settings UI (d3–6)**: connect/callback/disconnect + mock OAuth + `/settings/integrations`. *AC*: Playwright 1/2/5 green; real consent flow manually verified on localhost. **Gate: submit Google brand verification for `calendar.readonly` now.**
- **M3 — Calendar sync engine (d6–9)**: adapter, cursors, classification, relationship matching, `/api/cron/sync`, manual sync. *AC*: Playwright 3/4/8 green; 410-resync unit test green; cron added to `vercel.json`.
- **M4 — Grounded moves (d9–12)**: context blocks, `source_ref` enforcement, move linking, mock-AI grounded moves, MoveCard provenance, ConnectPrompt. *AC*: Playwright 6 green; verified-downgrade test green; a scheduled brief for a calendar-connected seed user contains an event-grounded move.
- **M5 — Verified opportunities (d12–15)**: GH/Lever adapters, boards UI, freshness/closed transitions, OP-grounded moves. *AC*: Playwright 7 green; transition unit tests green.
- **M6 — Hardening + docs (buffer)**: real-Google staging E2E, doc updates, `koda_events` instrumentation (`integration_connected/disconnected/sync_failed` — ids+enums only), screenshots for PR.

## 18. Dependencies & Credentials

- Google Cloud project; OAuth consent screen (external, Testing) with `calendar.readonly` + identity scopes; OAuth client IDs/secrets per env (localhost / staging / prod; previews point at staging); brand verification submission (M2). **Gmail CASA/restricted-scope paperwork initiated this sprint for next sprint's build.**
- New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KODA_TOKEN_ENC_KEY` (per env, in Vercel + `.env.example`), `KODA_INTEGRATIONS_MOCK`.
- M5 needs **zero credentials** (public APIs). No new npm deps beyond Vitest (Google calls via plain `fetch`; Node built-in crypto).

## 19. Risks & Fallbacks

- **Google verification delay** → Testing mode fully workable for founder + testers given first-class reconnect UX (7-day refresh expiry is a designed-for state); M5 delivers OAuth-free value regardless.
- **Board-token ambiguity / non-GH-Lever companies** → user-confirmed URLs, honest copy, per-board validation fetch.
- **Prompt bloat / context overrun** → hard caps live in one function; tune there.
- **Vercel cron duration** → 50-integration cap + stale-first + maxDuration; remainder next run.
- **OAuth fiddliness (largest schedule risk)** → mock OAuth lands in the same milestone (M2) so M3–M5 never block on Google.
- **Model fabricating "verified"** → server-side downgrade makes the label unforgeable regardless of model behavior.
- **Upstream API drift** → defensive parsing; failed run + `last_sync_error`, never a crash; stale labeling at read time.

## 20. Acceptance Criteria (sprint-level)

1. A user can connect Google Calendar read-only, see status/scope/last-sync in settings, sync manually, and disconnect with full imported-data deletion — all Playwright-verified in mock mode and manually verified against real Google on staging.
2. A brief for a calendar-connected user contains at least one move linked to a real event, labeled Verified with working source link and freshness timestamp; the same event never yields duplicate moves across regenerations.
3. A user with target companies on public boards receives opportunity moves with live URLs, retrieval time, and correct live/stale/closed transitions.
4. No token is readable by any non-service-role client (asserted in tests); no adapter or route can send, create events, or apply; `sent` remains rejected.
5. Users with zero or partial integrations experience today's app unchanged; all 9 existing Playwright specs still green.
6. `scripts/validate.sh` (now incl. Vitest) and CI green; independent code review completed; docs updated.
7. All commits on `feat/initial-integrations`, Conventional style, co-authored by Dylan.

## 21. Recommended Sequence for Later Sprints

1. **Gmail** (verification permitting): user-selected thread import (label/search-scoped picker, never full-mailbox scan), follow-up detection, grounded relationship context, reply drafts on moves, optional Gmail *draft* creation after explicit per-draft approval — on the same adapter/token/sync rails built this sprint.
2. **Opportunity Workspace + outreach workflows**: one surface per opportunity (fit/gaps, path in, people, email + LinkedIn drafts w/ copy-to-clipboard, deadlines, source status), aggregating this sprint's atoms.
3. **Proof-of-work plan builder + application packet**: structured artifacts linked to verified opportunities; user-reviewed packet with submission checklist (no auto-submit).
4. **Calendar deadline ingestion + follow-up automation depth**: deadline-type events, post-chat follow-up chains, richer relationship timeline.
5. **Scale & polish**: parallelized crons, typed Supabase client, Zod everywhere, error monitoring (Sentry), global opportunity cache if warranted.

---

## Verification Plan (during implementation)

- Per milestone: `bash scripts/validate.sh` (lint + tsc + vitest + build + Playwright) must pass — repo's Definition of Done.
- Exercise the real flow in a running app per CLAUDE.md: `bash scripts/dev.sh` + browser walkthrough of connect → sync → grounded brief → disconnect in mock mode; real-Google walkthrough on staging at M2/M4/M6.
- RLS proof: authed-client zero-row read of `integration_tokens` asserted in Playwright test 1.
- Regression: all 9 existing specs stay green throughout (no-integration behavior unchanged).
- Independent review before merge; PR includes screenshots of the three new surfaces.
