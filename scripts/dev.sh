#!/usr/bin/env bash
# Start the full Koda local development environment.
# Usage: bash scripts/dev.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "--- Koda dev environment ---"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed.${NC}"
  exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}Error: npm is not installed.${NC}"
  exit 1
fi

# Check node_modules
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Check .env.local
if [ ! -f ".env.local" ]; then
  echo -e "${RED}Error: .env.local not found.${NC}"
  echo "Copy .env.example to .env.local and fill in your keys:"
  echo "  cp .env.example .env.local"
  exit 1
fi

# Check required env vars
source_env() {
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    # Export the variable
    export "$line" 2>/dev/null || true
  done < .env.local
}
source_env

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo -e "${RED}Error: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local${NC}"
  exit 1
fi

if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo -e "${RED}Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local${NC}"
  exit 1
fi

# Optional warnings
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "Warning: ANTHROPIC_API_KEY not set — move generation will use mock data."
fi

echo -e "${GREEN}Environment OK. Starting dev server...${NC}"
echo ""

npm run dev
