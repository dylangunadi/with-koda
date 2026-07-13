# Architecture — Koda

## Frontend

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS 4** + **shadcn/ui** (base-nova style)
- **Fonts**: Geist Sans, Geist Mono, Newsreader (Google Fonts)
- **Theme**: next-themes (light default, system disabled)
- **Analytics**: @vercel/analytics (pageviews) + internal `koda_events` table (product events)
- **Toasts**: sonner
- **Voice**: Web Speech API via `useCallMachine` (feature-detected call state machine: recognition + interruptible TTS; text input always primary)

## Backend Services

All backend logic runs as Next.js API routes and server actions:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/talk` | POST | User | One conversational turn, streamed as an event stream of reply deltas plus a final payload (onboarding mode until a profile exists, then ongoing) |
| `/api/talk/confirm` | POST | User | Resolve a pending conversation proposal (relationship memory or profile diff) |
| `/api/events` | POST | User | Whitelisted client-originated product events |
| `/api/moves` | GET | User | List moves (optional status filter) |
| `/api/moves/generate` | POST | User | Generate a manual brief (3 moves) via the AI provider |
| `/api/moves/[id]` | PATCH | User | Update move status or outreach draft (`sent` rejected) |
| `/api/briefs` | POST | User | Scheduled-brief consent and email-digest opt-in (sole writer of brief settings) |
| `/api/briefs/confirm` | GET | Token | Email double-opt-in confirmation |
| `/api/cron/brief` | GET | CRON_SECRET | Scheduled brief generation, idempotent per user per day |
| `/api/waitlist` | POST | Public | Waitlist signup |

Server actions: `confirmOnboarding` in `src/app/talk/actions.ts` (persist reviewed profile, close conversation, generate first brief — idempotent); `saveProfile` in `src/app/onboarding/actions.ts` (profile fields only; never touches brief settings).

## AI Provider Layer

`src/lib/koda/ai/` defines one `KodaAI` interface (`onboardingTurn`, `ongoingTurn`, `generateMoves`) with two implementations:

- **anthropic.ts** — Claude Sonnet, streaming. Turn responses use a reply-first protocol (plain spoken text, then a `<<<DATA>>>` sentinel, then JSON metadata) so words reach the client as the model produces them; the sentinel is held back from deltas and metadata parsing is best-effort. Proposals are sanitized against whitelists; no chain-of-thought reaches the client.
- **mock.ts** — deterministic offline provider, active when `KODA_AI_MOCK=1` or no `ANTHROPIC_API_KEY`. Streams reply text in fixed chunks, grounded exclusively in user-provided data, and always labeled ("Offline sample mode" chip; prefixed source notes).

Server-authoritative rules regardless of provider: the onboarding checklist and `done` decision are computed server-side; extraction merges never empty a field; ongoing-mode proposals write nothing until `/api/talk/confirm`; old profile values in diffs are filled server-side. A test-only failure-injection header (`x-koda-test-ai: fail`) works only in mock mode outside production and can only cause failures.

## Authentication

- **Supabase Auth** with email + password
- Session refresh via middleware (`src/middleware.ts`)
- Server-side: `supabase.auth.getUser()` in API routes and server components
- Client-side: `createBrowserClient` from `@supabase/ssr`
- No OAuth providers configured
- Middleware matcher excludes static assets, images, and `/api/waitlist`
- Route protection is per-page: "onboarded" means a `profiles` row exists (login, `/inbox`, and `/talk` all branch on it)

## Database & Storage

- **Supabase PostgreSQL** (hosted)
- Core tables (+ waitlist):
  - `profiles` — user recruiting profiles (1:1 with auth.users), including conversational-onboarding fields (`recruiting_stage`, `timeline`, `proof_points`, `success_definition`, `contacts_notes`) and brief settings
  - `briefs` — first-class brief rows (source: onboarding | manual | scheduled) with partial unique indexes for one-onboarding-brief-per-user and one-scheduled-brief-per-user-per-day
  - `recruiting_moves` — generated moves (linked by `brief_id`; display fields `priority`, `effort`, `effort_bucket` quick/focused/project, `actual_effort_bucket` reported at completion for calibration, `expected_outcome`, `source_status`)
  - `move_events` — feedback/action tracking
  - `koda_conversations` / `koda_messages` — conversation state; `extracted` jsonb is the structured resume mechanism; proposals live on message payloads
  - `relationships` — confirmed relationship memory; `source_message` preserves the user's words verbatim
  - `koda_events` — product event log (ids/enums/counts only; see `src/lib/koda/events.ts`)
- All tables have RLS policies scoping data to `auth.uid() = user_id`
- Migrations in `supabase/migrations/`. Known issue: the two `20260710_*` files sort against their dependency order; apply `koda_mvp_schema` before `koda_agentic_layer` on a fresh database.
- Cron endpoint uses service role key to bypass RLS

## Third-Party Integrations

| Service | Purpose | Required |
|---------|---------|----------|
| Supabase | Database + Auth | Yes |
| Anthropic Claude (Sonnet 4.5) | Conversation + move generation | No (labeled offline provider without it) |
| Resend | Email digests | No (console fallback) |
| Vercel | Hosting + Cron | Yes (production) |
| Vercel Analytics | Usage tracking | No |

## Important Directories

```
src/app/           — Pages and API routes (talk/, inbox/, settings/, api/)
src/components/    — React components (talk/ for conversation UI, ui/ for shadcn primitives)
src/lib/           — Shared utilities, types, Supabase clients
src/lib/koda/      — AI provider layer, prompts, briefs, onboarding checklist, agent context, events
supabase/          — Database config and migrations
tests/             — Playwright tests (+ helpers/)
scripts/           — Dev, validation, and review scripts
```

## Key Data Flows

### Conversational Onboarding
1. New user hits `/talk` (routed from signup, login, or the inbox guard): a fixed-viewport call surface. Start call enters a voice state machine (`src/components/talk/useCallMachine.ts`): automatic listening, pause-based turn detection, sentence-streamed TTS the user can interrupt (a barge-in also silences the rest of that streaming reply, and speech captured while a turn is still in flight goes to the composer instead of being dropped), low-confidence transcripts routed to the composer, truthful mic indication with a manual Reconnect after network errors, and a wind-down at the end of onboarding (mic off first, the spoken summary finishes, then the call ends). Unmounting the surface mid-call releases the microphone unconditionally. The text composer is always available.
2. Each turn → `POST /api/talk` (streamed): load/create the active conversation, compute missing checklist fields server-side, stream the provider's reply as deltas, additively merge the extraction, persist both messages and the merged state only after the provider completes (a failed turn persists nothing; the optimistic user bubble rolls back into the composer and retry reuses the same client turn id, which the server dedupes)
3. When the server-side checklist is empty, the review screen renders; `confirmOnboarding` upserts the profile, closes the conversation, and generates the first brief through `insertBriefWithMoves` (double-confirm safe)

### Ongoing Conversation
1. Onboarded user talks at `/talk` → `POST /api/talk` (ongoing mode) with profile, recent moves, and relationships as grounding
2. `add_context` / `update_profile` intents return proposals stored as `pending` on the Koda message; `POST /api/talk/confirm` claims the resolution, applies effects (relationship inserts with verbatim source, whitelisted profile updates), and reverts on failure
3. `ask_next_move` returns one concrete recommendation from real grounding data

### Move Generation (manual)
1. "Run Koda" → `POST /api/moves/generate`: auth, 2-minute rate limit, profile load
2. `buildAgentContext()` fetches last 50 moves + events + relationships, extracts feedback patterns
3. The provider generates 3 moves; `insertBriefWithMoves` creates a `briefs` row (source `manual`) with linked moves and `generated` events

### Scheduled Brief
1. Vercel Cron hits `GET /api/cron/brief` daily at 8 AM UTC
2. Route verifies `CRON_SECRET`, uses service role client, selects `autonomous_enabled = true` with a daily/weekly frequency
3. Per user: claims the day's brief via the unique index before generating (reruns skip; failures release the claim), inserts linked moves, and emails the digest only when `brief_email` is set and `brief_confirmed` (the email double-opt-in)

### Move Actions
1. User clicks Accept move / Mark completed / Save for later / Not relevant → `PATCH /api/moves/[id]`
2. Route validates UUID and status (`sent` rejected — no sending integration exists), updates via RLS, records `move_events` and a `koda_events` product event

## Deployment

- **Platform**: Vercel
- **Domain**: withkoda.app
- **Cron**: `/api/cron/brief` at `0 8 * * *` (configured in `vercel.json`; crons run on production deployments only)
- **Package manager**: npm (package-lock.json)
- **Node.js**: LTS (configured in CI)

### Environments

| Environment | Supabase project | Notes |
|---|---|---|
| Production (`main`) | `recruit-crm` (`fbjcohgaaeaojdgtyxbm`) | Live data. Vercel env vars scoped to Production only. |
| Preview (branches/PRs) | `koda-staging` (`nxwcxhdhznkesmjhpnba`) | Full schema applied (all repo migrations + waitlist), zero data. Vercel env vars scoped to Preview point here so branch testing can never touch production data. |

Preview-scoped Vercel variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (staging's), `CRON_SECRET` (any random string; lets you exercise `/api/cron/brief` manually on a preview), and either `ANTHROPIC_API_KEY` or `KODA_AI_MOCK=1` (labeled offline provider). Production-scoped variables must not be set to "All Environments", or previews would write to production.

## Known Architectural Risks

- **Sequential cron**: Scheduled briefs process users one at a time; will not scale past ~100 users without parallelization or queuing
- **No database types**: Supabase client is untyped; queries return `any`
- **No input validation library**: API routes validate manually (no Zod/Yup)
- **Service role key in API route**: `/api/waitlist` falls back to anon key if service role unavailable
- **No error monitoring**: No Sentry or equivalent; errors go to console
- **No rate limiting infrastructure**: Move generation rate limit is per-user DB query, not middleware-level
- **koda_events RLS**: browsers could insert events directly for their own user, bypassing the `/api/events` whitelist (self-pollution only)
- **resume_text/experience_summary duplication**: Both fields populated from same onboarding input
- **Live provider unverified in CI/sandbox**: environments without an `ANTHROPIC_API_KEY` exercise only the offline provider
