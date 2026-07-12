# Skill: Build Feature

## Workflow

1. **Inspect** — Read relevant source files. Understand the current state before changing anything.
2. **Define acceptance criteria** — State what "done" looks like for this feature. Include user-visible behavior.
3. **Plan** — List the files to create or modify. Identify dependencies and risks.
4. **Implement** — Make the smallest reasonable change. Follow repository conventions from `AGENTS.md`.
5. **Run app** — Start the dev server (`npm run dev`) and verify the feature works in the browser.
6. **Browser-test** — Exercise the relevant user flow manually or with Playwright. Create or update durable Playwright tests for the critical path.
7. **Validate** — Run `bash scripts/validate.sh` (lint, types, build, tests).
8. **Independent review** — Run `./scripts/codex-review.sh <base-branch> .agent/reviews/<name>.md` (detect the base from repository evidence; do not assume `main`). Read the full review.
9. **Fix** — Verify each blocker/high/medium finding against the code; fix valid ones with the smallest change; record rejected findings with rationale. Rerun browser tests and validation after fixes.
10. **Summarize** — Report: files changed, commands run with actual results, evidence (screenshots/traces), remaining risks.

## Rules

- One primary implementation owner; never let multiple agents modify overlapping files.
- Make the smallest reasonable change.
- Do not edit unrelated files.
- Preserve user input during failure states; a failed request must never lose what the user typed.
- Use browser evidence, not code inspection alone, to claim a flow works.
- Stop after four fix rounds, or two rounds without meaningful progress, and report precise blockers.
- No production deployment or production-data changes.
- Do not claim success based only on compilation.
- Exercise the relevant flow through the running application.
- Report commands run and their actual results.
- Stop and report rather than hiding failed validation.
- Do not commit secrets, authentication state, or generated browser credentials.
- Follow code conventions from `AGENTS.md`.
- All changes must pass `scripts/validate.sh` before the task is complete.
