# Architecture — Koda

## Frontend

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS 4** + **shadcn/ui** (base-nova style)
- **Fonts**: Geist Sans, Geist Mono, Newsreader (Google Fonts)
- **Theme**: next-themes (light default, system disabled)
- **Analytics**: @vercel/analytics
- **Toasts**: sonner

## Backend Services

All backend logic runs as Next.js API routes and server actions:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/moves` | GET | User | List moves (optional status filter) |
| `/api/moves/generate` | POST | User | Generate 3 new moves via Claude |
| `/api/moves/[id]` | PATCH | User | Update move status or outreach draft |
| `/api/cron/brief` | GET | CRON_SECRET | Autonomous brief generation for opted-in users |
| `/api/waitlist` | POST | Public | Waitlist signup |

Server action: `saveProfile` in `src/app/onboarding/actions.ts` (upserts profile)

## Authentication

- **Supabase Auth** with email + password
- Session refresh via middleware (`src/middleware.ts`)
- Server-side: `supabase.auth.getUser()` in API routes and server components
- Client-side: `createBrowserClient` from `@supabase/ssr`
- No OAuth providers configured
- Middleware matcher excludes static assets, images, and `/api/waitlist`

## Database & Storage

- **Supabase PostgreSQL** (hosted)
- 3 core tables (+ waitlist):
  - `profiles` — user recruiting profiles (1:1 with auth.users)
  - `recruiting_moves` — AI-generated moves
  - `move_events` — feedback/action tracking
- All tables have RLS policies scoping data to `auth.uid() = user_id`
- Migrations in `supabase/migrations/`
- Cron endpoint uses service role key to bypass RLS

## Third-Party Integrations

| Service | Purpose | Required |
|---------|---------|----------|
| Supabase | Database + Auth | Yes |
| Anthropic Claude (Sonnet 4.5) | Move generation | No (mock fallback) |
| Resend | Email digests | No (console fallback) |
| Vercel | Hosting + Cron | Yes (production) |
| Vercel Analytics | Usage tracking | No |

## Important Directories

```
src/app/           — Pages and API routes
src/components/    — React components (ui/ for shadcn primitives)
src/lib/           — Shared utilities, types, Supabase clients
src/lib/koda/      — AI move generation engine
supabase/          — Database config and migrations
tests/             — Playwright tests
scripts/           — Dev and validation scripts
```

## Key Data Flows

### Move Generation
1. User clicks "Run Koda" → `POST /api/moves/generate`
2. Route verifies auth, checks rate limit, loads profile
3. `buildAgentContext()` fetches last 50 moves + events, extracts feedback patterns
4. `generateRecruitingMoves()` calls Claude with profile + agent context
5. Response parsed, validated, sanitized → inserted into `recruiting_moves`
6. `move_events` records with `event_type: "generated"` created

### Autonomous Brief
1. Vercel Cron hits `GET /api/cron/brief` daily at 8 AM UTC
2. Route verifies `CRON_SECRET`, uses service role client
3. Fetches all profiles with `autonomous_enabled = true`
4. For each user: builds context, generates moves, inserts, sends email digest

### Move Actions
1. User clicks Accept/Reject/Save/Sent → `PATCH /api/moves/[id]`
2. Route validates UUID, verifies ownership via RLS, updates status
3. `move_events` record created with appropriate event type

## Deployment

- **Platform**: Vercel
- **Domain**: withkoda.app
- **Cron**: `/api/cron/brief` at `0 8 * * *` (configured in `vercel.json`)
- **Package manager**: npm (package-lock.json)
- **Node.js**: LTS (configured in CI)

## Known Architectural Risks

- **Sequential cron**: Autonomous brief processes users one at a time; will not scale past ~100 users without parallelization or queuing
- **No database types**: Supabase client is untyped; queries return `any`
- **No input validation library**: API routes validate manually (no Zod/Yup)
- **Service role key in API route**: `/api/waitlist` falls back to anon key if service role unavailable
- **No error monitoring**: No Sentry or equivalent; errors go to console
- **No rate limiting infrastructure**: Move generation rate limit is per-user DB query, not middleware-level
- **resume_text/experience_summary duplication**: Both fields populated from same onboarding input
