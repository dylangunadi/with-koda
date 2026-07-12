# AGENTS.md — Shared Agent Instructions

## Repository Map

```
with-koda/
  src/
    app/
      page.tsx                    # Landing page (marketing + waitlist)
      login/page.tsx              # Email/password auth (client component)
      onboarding/                 # 4-step profile setup wizard
        page.tsx                  # Onboarding UI
        actions.ts                # Server action: saveProfile
      inbox/                      # Main app — agent inbox
        page.tsx                  # Server component: fetches moves
        layout.tsx                # AppShell wrapper
      settings/                   # Profile editing + autonomous briefs
        page.tsx                  # Client component: edit profile
        layout.tsx                # AppShell wrapper
      api/
        waitlist/route.ts         # POST — waitlist signup
        moves/route.ts            # GET — list moves
        moves/generate/route.ts   # POST — generate moves via Claude
        moves/[id]/route.ts       # PATCH — update move status/draft
        cron/brief/route.ts       # GET — autonomous brief cron
    components/
      ui/                         # shadcn/ui primitives
      AppShell.tsx                # Authenticated layout (nav + sign out)
      MoveCard.tsx                # Recruiting move card with actions
      GenerateMovesButton.tsx     # "Run Koda" trigger
      InboxTabs.tsx               # Tab view: Today/Saved/Sent/Rejected
      WaitlistForm.tsx            # Landing page waitlist form
      AgentStatus.tsx             # Animated agent status bar
    lib/
      supabase/client.ts          # Browser Supabase client
      supabase/server.ts          # Server Supabase client (cookies)
      koda/generateRecruitingMoves.ts  # Claude API call + mock fallback
      koda/prompts.ts             # System prompt + user prompt builder
      koda/agentContext.ts        # Feedback pattern extraction
      koda/email.ts               # Brief email via Resend
      types.ts                    # TypeScript interfaces
      env.ts                      # Environment variable accessors
      utils.ts                    # cn() utility
    middleware.ts                 # Supabase session refresh
  supabase/
    config.toml                   # Local Supabase config
    migrations/                   # SQL migration files
  tests/                          # Playwright test files
  specs/                          # Test plans
  scripts/                        # Dev and validation scripts
  docs/                           # Product, architecture, design, testing docs
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

## Pull Request Expectations

- Title: concise, imperative mood (e.g., "Add move filtering by company")
- Description: what changed, why, how to test
- All validation passes (`scripts/validate.sh`)
- No unrelated changes
- Screenshots for UI changes
- Tested in browser for user-facing changes

## Definition of Done

1. `scripts/validate.sh` passes (lint, types, build)
2. Relevant user flow exercised in running app or browser test
3. No regressions in existing functionality
4. Code follows repository conventions
5. No secrets, auth state, or generated credentials committed
