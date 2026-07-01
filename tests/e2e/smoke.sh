#!/usr/bin/env bash
# E2E smoke tests for pi-agy-provider
# Tests real API calls against Google's OpenAI-compatible endpoint.
#
# Usage:
#   GEMINI_API_KEY=your_key bash tests/e2e/smoke.sh
#
# Requires: pi (coding agent) installed and this provider accessible.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

PROVIDER_PATH="$(cd "$(dirname "$0")/../.." && pwd)"
TIMEOUT="${TIMEOUT:-45}"
API_BASE="${GEMINI_API_BASE:-https://generativelanguage.googleapis.com/v1beta/openai}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo -e "${RED}ERROR: GEMINI_API_KEY not set${NC}"
  echo "Usage: GEMINI_API_KEY=your_key bash tests/e2e/smoke.sh"
  exit 1
fi

if ! command -v pi &>/dev/null; then
  echo -e "${RED}ERROR: pi not found on PATH${NC}"
  echo "Install: npm install -g @earendil-works/pi-coding-agent"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Google Gemini (agy) Provider — E2E Smoke Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test() {
  local name="$1"
  local model="$2"
  local prompt="$3"
  local expected="$4"

  echo -n "  $name ... "

  output=$(timeout "$TIMEOUT" pi --no-extensions \
    -e "$PROVIDER_PATH" \
    --model "agy/$model" \
    --no-tools \
    -p "$prompt" 2>&1) || true

  if echo "$output" | grep -qi "$expected"; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS++)) || true
  else
    echo -e "${RED}FAIL${NC}"
    echo "    Expected output to contain: $expected"
    echo "    Got: $(echo "$output" | head -3)"
    ((FAIL++)) || true
  fi
}

echo -e "${YELLOW}1. API Authentication${NC}"
echo -n "  Auth check ... "
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API_BASE/chat/completions" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.5-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' 2>&1) || true

if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
  echo -e "${GREEN}PASS${NC}"
  ((PASS++)) || true
else
  echo -e "${RED}FAIL${NC}"
  echo "    API key is invalid or API is unreachable (HTTP $status)"
  ((FAIL++)) || true
fi

echo ""

echo -e "${YELLOW}2. Model Smoke Tests${NC}"

run_test "Gemini 3.5 Flash (simple math)" \
  "gemini-3.5-flash" \
  "What is 2+3? Answer with just the number." \
  "5"

run_test "Gemini 3.5 Flash (knowledge)" \
  "gemini-3.5-flash" \
  "What is the capital of Japan? One word." \
  "tokyo"

run_test "Gemini 3.1 Pro (simple math)" \
  "gemini-3.1-pro-preview" \
  "What is 6+2? Answer with just the number." \
  "8"

echo ""

echo -e "${YELLOW}3. Error Handling${NC}"

echo -n "  Invalid API key ... "
output=$(GEMINI_API_KEY="invalid_key_12345" \
  timeout "$TIMEOUT" pi --no-extensions \
  -e "$PROVIDER_PATH" \
  --model "agy/gemini-3.5-flash" \
  --no-tools \
  -p "test" 2>&1) || true

if echo "$output" | grep -qi "401\|403\|unauthorized\|invalid.*key\|authentication"; then
  echo -e "${GREEN}PASS${NC}"
  ((PASS++)) || true
else
  echo -e "${RED}FAIL${NC}"
  echo "    Expected error for invalid key"
  echo "    Got: $(echo "$output" | head -3)"
  ((FAIL++)) || true
fi

echo -n "  Invalid model ID ... "
output=$(timeout "$TIMEOUT" pi --no-extensions \
  -e "$PROVIDER_PATH" \
  --model "agy/nonexistent-gemini-model" \
  --no-tools \
  -p "test" 2>&1) || true

if echo "$output" | grep -qi "error\|not found\|invalid.*model\|does not exist"; then
  echo -e "${GREEN}PASS${NC}"
  ((PASS++)) || true
else
  echo -e "${RED}FAIL${NC}"
  echo "    Expected error for invalid model"
  echo "    Got: $(echo "$output" | head -3)"
  ((FAIL++)) || true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}PASS${NC}: $PASS  ${RED}FAIL${NC}: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
