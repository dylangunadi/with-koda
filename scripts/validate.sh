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

# 4. Playwright tests (only when the browser Playwright will use actually
# exists; honors PLAYWRIGHT_BROWSERS_PATH installs and the
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH override from playwright.config.ts)
BROWSER_PATH=$(node -e '
  const fs = require("fs");
  try {
    const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || require("playwright").chromium.executablePath();
    process.stdout.write(fs.existsSync(p) ? p : "");
  } catch { /* no playwright or unresolvable browser */ }
' 2>/dev/null || true)

echo "--- Playwright tests ---"
if [ -n "$BROWSER_PATH" ]; then
  npx playwright test --project=chromium 2>&1 || {
    echo -e "${RED}Playwright tests failed.${NC}"
    exit 1
  }
  echo -e "${GREEN}Playwright tests passed.${NC}"
else
  echo "Skipped: no launchable Chromium found. Run 'npx playwright install chromium'"
  echo "or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an existing browser binary."
fi

echo ""
echo -e "${GREEN}=== All validation checks passed ===${NC}"
