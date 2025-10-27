#!/usr/bin/env bash
set -eu

BASE=${BASE_URL:-http://localhost:3000}
FAIL=0

echo "Testing API endpoints against $BASE"

check_code() {
  local method=$1 url=$2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
  echo "$code"
}

echo "1) POST /countries/refresh"
code=$(check_code POST "$BASE/countries/refresh")
if [ "$code" != "200" ]; then echo "  ✖ refresh failed (HTTP $code)"; FAIL=1; else echo "  ✔ refresh OK"; fi

echo "2) GET /countries"
code=$(check_code GET "$BASE/countries")
if [ "$code" != "200" ]; then echo "  ✖ list failed (HTTP $code)"; FAIL=1; else echo "  ✔ list OK"; fi

echo "3) GET /countries?region=Africa&sort=gdp_desc"
code=$(check_code GET "$BASE/countries?region=Africa&sort=gdp_desc")
if [ "$code" != "200" ]; then echo "  ✖ filter/sort failed (HTTP $code)"; FAIL=1; else echo "  ✔ filter/sort OK"; fi

echo "4) GET /countries/Nigeria"
code=$(check_code GET "$BASE/countries/Nigeria")
if [ "$code" != "200" ]; then echo "  ✖ get one failed (HTTP $code)"; FAIL=1; else echo "  ✔ get one OK"; fi

echo "5) DELETE /countries/Nigeria"
code=$(check_code DELETE "$BASE/countries/Nigeria")
if [ "$code" != "200" ]; then echo "  ✖ delete failed (HTTP $code)"; FAIL=1; else echo "  ✔ delete OK"; fi

echo "6) GET /status"
code=$(check_code GET "$BASE/status")
if [ "$code" != "200" ]; then echo "  ✖ status failed (HTTP $code)"; FAIL=1; else echo "  ✔ status OK"; fi

echo "7) GET /countries/image"
headers=$(mktemp)
curl -s -D "$headers" -o /dev/null "$BASE/countries/image" || true
if grep -iq "Content-Type: image/png" "$headers"; then
  echo "  ✔ image OK";
else
  echo "  ✖ image failed (not image/png)"; FAIL=1;
fi
rm -f "$headers"

if [ "$FAIL" -ne 0 ]; then
  echo "\nSome tests failed"; exit 1
else
  echo "\nAll tests passed"; exit 0
fi
