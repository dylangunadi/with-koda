# CLAUDE.md — Koda

Read `AGENTS.md` before starting any task.

## Documentation

| Topic | Location |
|-------|----------|
| Product | `docs/PRODUCT.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Design | `docs/DESIGN.md` |
| Testing | `docs/TESTING.md` |
| Roadmap | `TODOS.md` |
| Agent instructions | `AGENTS.md` |

## Commands

```bash
# Development
npm run dev                  # Start Next.js dev server (port 3000)
npm run build                # Production build
npm run lint                 # ESLint
npx tsc --noEmit             # Type-check

# Testing
npx playwright test          # All Playwright tests
npx playwright test --project=chromium  # Chromium only

# Validation (all checks)
bash scripts/validate.sh     # Lint + types + build + tests

# Local environment
bash scripts/dev.sh          # Start full local dev environment
```

## Rules

- No task is complete until `scripts/validate.sh` passes and the relevant user flow has been exercised in a running app or browser test.
- Do not modify production data, secrets, or production infrastructure without explicit approval from Dylan.
- Do not commit `.env*` files, authentication state, or generated browser credentials.
- Do not invent architecture or commands — derive everything from the repository.
- Keep changes minimal and focused. Do not refactor unrelated code.
- Exercise the relevant flow through the running application before claiming success.
- Stop and report rather than hiding failed validation.

## Environment Variables

See `.env.example` for required variables. Core required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional but important:
- `ANTHROPIC_API_KEY` (without it Koda runs in labeled offline sample mode; KODA_AI_MOCK=1 forces it)
- `SUPABASE_SERVICE_ROLE_KEY` (needed for cron/waitlist)
