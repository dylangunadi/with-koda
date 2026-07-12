#!/usr/bin/env bash
# Run only release-blocking Playwright tests.
# Usage: bash scripts/e2e-critical.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Koda Critical E2E Tests ==="
echo ""

# Check Playwright browsers
if ! npx playwright install --dry-run &> /dev/null 2>&1 && [ ! -d "node_modules/playwright-core/.local-browsers" ]; then
  echo -e "${RED}Error: Playwright browsers not installed.${NC}"
  echo "Run: npx playwright install --with-deps"
  exit 1
fi

# Run only tests tagged @critical or in the critical test directory
# For now, runs all tests in chromium since no critical tests exist yet
npx playwright test --project=chromium --grep="@critical" 2>&1 || {
  # If no tests match @critical, that's expected for now
  echo "No tests tagged @critical found. Run all chromium tests instead."
  npx playwright test --project=chromium 2>&1 || {
    echo -e "${RED}Critical E2E tests failed.${NC}"
    exit 1
  }
}

echo ""
echo -e "${GREEN}=== Critical E2E tests passed ===${NC}"
