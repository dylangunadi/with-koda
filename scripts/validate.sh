#!/usr/bin/env bash
# Run all validation checks. Exits non-zero on first failure.
# Usage: bash scripts/validate.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Koda Validation ==="
echo ""

# 1. Lint
echo "--- Lint ---"
npm run lint
echo -e "${GREEN}Lint passed.${NC}"
echo ""

# 2. Type-check
echo "--- Type-check ---"
npx tsc --noEmit
echo -e "${GREEN}Type-check passed.${NC}"
echo ""

# 3. Build
echo "--- Build ---"
npm run build
echo -e "${GREEN}Build passed.${NC}"
echo ""

# 4. Playwright tests (if browsers are installed)
if npx playwright install --dry-run &> /dev/null 2>&1 || [ -d "node_modules/playwright-core/.local-browsers" ]; then
  echo "--- Playwright tests ---"
  npx playwright test --project=chromium 2>&1 || {
    echo -e "${RED}Playwright tests failed.${NC}"
    exit 1
  }
  echo -e "${GREEN}Playwright tests passed.${NC}"
else
  echo "--- Playwright tests ---"
  echo "Skipped: Playwright browsers not installed. Run 'npx playwright install' to enable."
fi

echo ""
echo -e "${GREEN}=== All validation checks passed ===${NC}"
