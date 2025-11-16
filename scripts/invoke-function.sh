#!/bin/bash
# Helper script to invoke Supabase Edge Functions
# Usage: ./scripts/invoke-function.sh <function-name> [anon-key]

FUNCTION_NAME=$1
ANON_KEY=${2:-""}

if [ -z "$FUNCTION_NAME" ]; then
  echo "Usage: $0 <function-name> [anon-key]"
  echo "Example: $0 scrape-tickets"
  exit 1
fi

# Get project URL from .env or use default
PROJECT_ID="chdluifdihnezhvsjaaj"
FUNCTION_URL="https://${PROJECT_ID}.supabase.co/functions/v1/${FUNCTION_NAME}"

# If anon key not provided, try to get it from web/.env.local
if [ -z "$ANON_KEY" ] && [ -f "web/.env.local" ]; then
  ANON_KEY=$(grep "VITE_PUBLIC_SUPABASE_ANON_KEY" web/.env.local | cut -d '"' -f 2)
fi

if [ -z "$ANON_KEY" ]; then
  echo "Error: Anon key not found. Please provide it as second argument or set in web/.env.local"
  exit 1
fi

echo "Invoking ${FUNCTION_NAME}..."
echo "URL: ${FUNCTION_URL}"
echo ""

curl -X POST "${FUNCTION_URL}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\n"

