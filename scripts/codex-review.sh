#!/usr/bin/env bash
# Read-only Codex review of the current branch diff.
# Usage: ./scripts/codex-review.sh [base-branch] [output-path]
set -euo pipefail

BASE_BRANCH="${1:-main}"
OUTPUT_PATH="${2:-.agent/reviews/codex-review.md}"

if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex is not installed or not on PATH" >&2
  exit 127
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

read -r -d '' PROMPT <<EOF || true
You are performing a strict, read-only code review. Do not modify any file.

Inspect the complete diff of the current branch against '${BASE_BRANCH}'
(for example: git diff ${BASE_BRANCH}...HEAD, plus any uncommitted working-tree
changes). Read the surrounding source files as needed to judge the change in
context.

Focus on:
- broken onboarding or Talk to Koda flows
- persistence and state consistency
- authentication and authorization
- privacy and exposure of user data
- duplicate records and missing idempotency
- API and model failure handling
- misleading or fake agentic behavior (UI that claims work the code does not do)
- accessibility
- tests that pass without proving the intended behavior
- regressions in existing behavior
- unnecessary complexity

Report only concrete, evidenced findings. For each finding give:
1. severity: blocker, high, medium, or low
2. affected file and the relevant code
3. reproduction or failure scenario
4. why it matters
5. the smallest recommended correction

Order findings by severity, blockers first. If the diff is empty or there are no
meaningful findings, say so explicitly and stop.

Output GitHub-flavored Markdown only.
EOF

codex \
  --sandbox read-only \
  --ask-for-approval never \
  exec \
  --ephemeral \
  --output-last-message "$OUTPUT_PATH" \
  "$PROMPT" </dev/null

echo "Codex review saved to $OUTPUT_PATH"
