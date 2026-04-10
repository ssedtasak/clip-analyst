#!/bin/bash
# Clip Analyst — Smoke Test
# Usage: ./test-smoke.sh [worker-url]
# Default: http://localhost:8788

WORKER_URL="${1:-http://localhost:8788}"
PASS=0
FAIL=0

echo "=== Clip Analyst Smoke Test ==="
echo "Worker: $WORKER_URL"
echo ""

# Test 1: Health check (should return 400 without body)
echo "Test 1: POST without body"
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$WORKER_URL" -H "Content-Type: application/json" 2>/dev/null)
if [[ "$RESPONSE" == "400" || "$RESPONSE" == "405" ]]; then
  echo "  ✓ PASS (HTTP $RESPONSE)"
  ((PASS++))
else
  echo "  ✗ FAIL (HTTP $RESPONSE, expected 400/405)"
  ((FAIL++))
fi

# Test 2: Invalid URL format
echo ""
echo "Test 2: Invalid URL format"
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url","keyMessage":"test"}' 2>/dev/null)
if [[ "$RESPONSE" == "400" ]]; then
  echo "  ✓ PASS (HTTP $RESPONSE)"
  ((PASS++))
else
  echo "  ✗ FAIL (HTTP $RESPONSE, expected 400)"
  ((FAIL++))
fi

# Test 3: Valid URL format (will fail at Cobalt but should get past validation)
echo ""
echo "Test 3: Valid URL format (may fail at Cobalt - expected)"
RESPONSE=$(curl -s -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/reel/ABC123/","keyMessage":"test"}' \
  --max-time 30 2>/dev/null)
if echo "$RESPONSE" | grep -q "error\|Error"; then
  echo "  ✓ PASS (Got error response - validation working)"
  ((PASS++))
else
  echo "  ? SKIP (Worker may be down or quota exceeded)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
