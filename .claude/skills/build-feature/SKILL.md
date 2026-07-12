# Skill: Build Feature

## Workflow

1. **Inspect** — Read relevant source files. Understand the current state before changing anything.
2. **Define acceptance criteria** — State what "done" looks like for this feature. Include user-visible behavior.
3. **Plan** — List the files to create or modify. Identify dependencies and risks.
4. **Implement** — Make the smallest reasonable change. Follow repository conventions from `AGENTS.md`.
5. **Run app** — Start the dev server (`npm run dev`) and verify the feature works in the browser.
6. **Browser-test** — Exercise the relevant user flow manually or with Playwright.
7. **Validate** — Run `bash scripts/validate.sh` (lint, types, build, tests).
8. **Review** — Re-read changed files. Check for missed edge cases, security issues, convention violations.
9. **Fix** — Address any issues found in review or validation.
10. **Summarize** — Report: files changed, commands run with results, remaining issues.

## Rules

- Make the smallest reasonable change.
- Do not edit unrelated files.
- Do not claim success based only on compilation.
- Exercise the relevant flow through the running application.
- Report commands run and their actual results.
- Stop and report rather than hiding failed validation.
- Do not commit secrets, authentication state, or generated browser credentials.
- Follow code conventions from `AGENTS.md`.
- All changes must pass `scripts/validate.sh` before the task is complete.
