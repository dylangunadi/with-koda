# AGENTS.md — Shared Agent Instructions

## Repository Map

```
with-koda/
  src/
    app/
      page.tsx                    # Landing page (marketing + waitlist)
      login/page.tsx              # Email/password auth (client component)
      talk/                       # Talk to Koda (conversational onboarding + ongoing)
        page.tsx                  # Server component: mode routing + resume
        actions.ts                # Server action: confirmOnboarding (profile + first brief)
      onboarding/                 # Legacy route: redirects to /talk
        page.tsx                  # Redirect
        actions.ts                # Server action: saveProfile (profile fields only)
      inbox/                      # Main app — agent inbox / brief surface
        page.tsx                  # Server component: fetches moves + latest brief
        layout.tsx                # AppShell wrapper
      settings/                   # Profile editing + scheduled briefs
        page.tsx                  # Client component: edit profile
        layout.tsx                # AppShell wrapper
      api/
        talk/route.ts             # POST — conversational turn (onboarding/ongoing)
        talk/confirm/route.ts     # POST — resolve conversation proposals
        events/route.ts           # POST — whitelisted client product events
        waitlist/route.ts         # POST — waitlist signup
        moves/route.ts            # GET — list moves
        moves/generate/route.ts   # POST — generate a manual brief via the AI provider
        moves/[id]/route.ts       # PATCH — update move status/draft ('sent' rejected)
        briefs/route.ts           # POST — scheduled-brief consent + email opt-in
        briefs/confirm/route.ts   # GET — email double-opt-in confirmation
        cron/brief/route.ts       # GET — scheduled brief cron (idempotent per day)
    components/
      ui/                         # shadcn/ui primitives
      talk/                       # TalkToKoda, ReviewConfirm, ConfirmationCard,
                                  #   VoiceInput, useSpeechRecognition
      AppShell.tsx                # Authenticated layout (nav + sign out)
      BriefHeader.tsx             # Brief label above the latest brief's moves
      MoveCard.tsx                # Move card: Accept/Complete/Save/Not relevant
      GenerateMovesButton.tsx     # "Run Koda" trigger
      InboxTabs.tsx               # Tabs: Today/Saved/Completed/Not relevant
      WaitlistForm.tsx            # Landing page waitlist form
      AgentStatus.tsx             # Animated agent status bar (landing only)
    lib/
      supabase/client.ts          # Browser Supabase client
      supabase/server.ts          # Server Supabase client (cookies)
      koda/ai/                    # KodaAI provider interface + anthropic + labeled mock
      koda/generateRecruitingMoves.ts  # Thin wrapper over the provider
      koda/prompts.ts             # System prompts + prompt builders
      koda/onboarding.ts          # Server-side onboarding checklist + merge rules
      koda/briefs.ts              # insertBriefWithMoves (brief + moves + events)
      koda/agentContext.ts        # Feedback patterns + relationship memory
      koda/events.ts              # koda_events logging (privacy rules in header)
      koda/email.ts               # Brief email via Resend
      types.ts                    # TypeScript interfaces
      env.ts                      # Environment variable accessors
      utils.ts                    # cn() utility
    middleware.ts                 # Supabase session refresh
  supabase/
    config.toml                   # Local Supabase config
    migrations/                   # SQL migration files (see docs/ARCHITECTURE.md for ordering note)
  tests/                          # Playwright tests + helpers/
  specs/                          # Test plans
  scripts/                        # Dev, validation, and review scripts
  docs/                           # Product, architecture, design, testing docs + overnight report
```

## Authoritative Documentation

- Product: `docs/PRODUCT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Design conventions: `docs/DESIGN.md`
- Testing: `docs/TESTING.md`
- Database schema: `supabase/migrations/`
- Environment variables: `.env.example`
- Deployment: `vercel.json`

## Commands

| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` |
| Build | `npm run build` |
| Playwright (all) | `npx playwright test` |
| Playwright (chromium) | `npx playwright test --project=chromium` |
| Full validation | `bash scripts/validate.sh` |
| Local dev start | `bash scripts/dev.sh` |
| E2E critical | `bash scripts/e2e-critical.sh` |

## Code Conventions (observed)

- **Framework**: Next.js 16 App Router, React 19, TypeScript strict mode
- **Styling**: Tailwind CSS 4 + shadcn/ui (base-nova style, neutral base color)
- **Fonts**: Geist Sans (body), Geist Mono (system labels), Newsreader (headings)
- **Path alias**: `@/*` maps to `./src/*`
- **Components**: Co-located in `src/components/`, shadcn primitives in `src/components/ui/`
- **Server vs client**: Server components by default; `"use client"` only when needed
- **Server actions**: Used for mutations (e.g., `saveProfile`)
- **API routes**: REST-style in `src/app/api/`; auth via `supabase.auth.getUser()`
- **State**: Local `useState`; no global state library
- **Toasts**: `sonner` via `toast.success()` / `toast.error()`
- **Icons**: `lucide-react`
- **CSS classes**: `font-system` for monospace system labels, `font-heading` for headings
- **Animations**: CSS keyframes in `globals.css`, `page-enter` class for entrance animations
- **Border radius**: Rounded-lg on inputs/buttons, rounded-xl on cards
- **Theme**: Light default (`defaultTheme="light"`)
- **Primary color**: Teal `#087C78`

## Prohibited Actions

- Do not modify production database or infrastructure without explicit approval
- Do not commit `.env*` files, secrets, or auth state
- Do not push to `main` without passing validation
- Do not fabricate test results or claim tests passed without running them
- Do not add dependencies without justification
- Do not refactor unrelated code during a focused task
- Do not remove or weaken RLS policies
- Do not bypass auth checks in API routes
- Do not read or write `integration_tokens` outside `src/lib/koda/integrations/tokens.ts`, add policies/grants to that table, log token values, or import token/crypto modules into client components
- Do not add any code path that autonomously sends messages, creates or edits calendar events, or performs outbound actions. The only permitted outbound writes are the Gmail draft and the deterministic per-move Gmail send, each triggered exclusively by an explicit user click in a user-session route — never from cron, sync, or any AI-driven path

## Pull Request Expectations

- Title: concise, imperative mood (e.g., "Add move filtering by company")
- Description: what changed, why, how to test
- All validation passes (`scripts/validate.sh`)
- No unrelated changes
- Screenshots for UI changes
- Tested in browser for user-facing changes

## Definition of Done

1. `scripts/validate.sh` passes (lint, types, unit tests, build)
2. Relevant user flow exercised in running app or browser test
3. No regressions in existing functionality
4. Code follows repository conventions
5. No secrets, auth state, or generated credentials committed
