# Koda

Your AI recruiting agent — find the right opportunity, the right person, and the right thing to send.

Koda helps ambitious undergrad students recruiting for tech, startups, PM, AI, and early-career roles turn vague goals into concrete daily recruiting actions.

## Features

- **Onboarding** — set your target roles, companies, background, and semester goals
- **Agent Inbox** — receive 3 personalized recruiting moves per generation
- **Move Cards** — each move includes fit reason, outreach draft, proof-of-work idea, and follow-up timing
- **Actions** — accept, reject, edit, save, or mark moves as sent
- **Feedback tracking** — every action is stored for future improvement

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Supabase (PostgreSQL + Auth)
- Anthropic Claude (move generation)
- Vercel (deployment)

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/dylangunadi/with-koda.git
cd with-koda

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in your Supabase and Anthropic keys

# 4. Apply database migrations
# Run both migration files in order:
# supabase/migrations/20260710_koda_mvp_schema.sql
# supabase/migrations/20260710_koda_agentic_layer.sql
# via the Supabase dashboard SQL editor or supabase db push

# 5. Start the dev server
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `ANTHROPIC_API_KEY` | No* | Anthropic API key for AI moves (*falls back to mock moves without) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key for autonomous briefs cron |
| `NEXT_PUBLIC_APP_URL` | No | App URL (defaults to http://localhost:3000) |
| `RESEND_API_KEY` | No | Resend API key for email digests (falls back to console logging) |
| `CRON_SECRET` | No | Secret for protecting the autonomous brief cron endpoint |

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in Vercel
3. Set the environment variables above in Vercel project settings
4. Deploy

The app will be available at your Vercel domain (e.g., withkoda.app).

## Database

Two migrations in `supabase/migrations/`:

1. `20260710_koda_mvp_schema.sql` — creates `profiles`, `recruiting_moves`, `move_events` tables with RLS
2. `20260710_koda_agentic_layer.sql` — adds `source_note` to moves, autonomous brief settings to profiles

All tables have RLS policies scoping data to the authenticated user.

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── login/                # Auth
│   ├── onboarding/           # Profile setup
│   ├── inbox/                # Agent inbox (main app)
│   ├── settings/             # Profile editing
│   └── api/
│       ├── waitlist/         # Waitlist signups
│       └── moves/            # Generate + manage moves
├── components/
│   ├── ui/                   # shadcn components
│   ├── MoveCard.tsx          # Recruiting move card
│   ├── GenerateMovesButton.tsx
│   ├── InboxTabs.tsx
│   └── WaitlistForm.tsx
└── lib/
    ├── supabase/             # Client + server helpers
    ├── koda/                 # Move generator + prompts
    ├── types.ts
    ├── env.ts
    └── utils.ts
```
