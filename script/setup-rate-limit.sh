#!/usr/bin/env bash
#
# Create (or replace) the publish rate-limit rule on meditor.dev via the
# Cloudflare Rulesets API. This is the one piece of infrastructure not owned by
# wrangler — run it once after the zone exists.
#
# Requirements:
#   - A Cloudflare API token with, for the meditor.dev zone:
#       Zone : Zone        : Read   (to look the zone up by name)
#       Zone : Zone WAF    : Edit   (to write the rate-limit rule)
#     Create at https://dash.cloudflare.com/profile/api-tokens (Custom token).
#
# Usage:
#   CF_API_TOKEN=xxxxx ./script/setup-rate-limit.sh
#
# Optional overrides (env): ZONE_NAME, REQUESTS, PERIOD, TIMEOUT.
# Note: on the Free plan, rate-limit rules are limited (one rule, IP-based
# counting, restricted periods). If the API rejects a value, lower PERIOD to 10
# or adjust REQUESTS, or create the rule in the dashboard instead.

set -euo pipefail

: "${CF_API_TOKEN:?Set CF_API_TOKEN to a token with Zone:Read + Zone WAF:Edit}"
ZONE_NAME="${ZONE_NAME:-meditor.dev}"
REQUESTS="${REQUESTS:-30}"   # max POST /api/v1/share per window, per IP
PERIOD="${PERIOD:-60}"       # window in seconds
TIMEOUT="${TIMEOUT:-60}"     # how long to keep blocking, in seconds

api="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

echo "Looking up zone ${ZONE_NAME}…"
zone_id="$(curl -s "${auth[@]}" "${api}/zones?name=${ZONE_NAME}" \
  | sed -n 's/.*"id":"\([0-9a-f]\{32\}\)".*/\1/p' | head -1)"
if [ -z "${zone_id}" ]; then
  echo "Could not resolve a zone id for ${ZONE_NAME}. Check the token and zone." >&2
  exit 1
fi
echo "Zone id: ${zone_id}"

read -r -d '' body <<JSON || true
{
  "rules": [
    {
      "action": "block",
      "description": "Throttle diagram publishing",
      "expression": "(starts_with(http.request.uri.path, \"/api/v1/share\") and http.request.method eq \"POST\")",
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": ${PERIOD},
        "requests_per_period": ${REQUESTS},
        "mitigation_timeout": ${TIMEOUT}
      }
    }
  ]
}
JSON

echo "Applying rate-limit rule (${REQUESTS} req / ${PERIOD}s per IP)…"
resp="$(curl -s -X PUT "${auth[@]}" \
  "${api}/zones/${zone_id}/rulesets/phases/http_ratelimit/entrypoint" \
  --data "${body}")"

if echo "${resp}" | grep -q '"success":true'; then
  echo "✅ Rate-limit rule is live on ${ZONE_NAME}."
else
  echo "❌ Cloudflare rejected the request:" >&2
  echo "${resp}" >&2
  exit 1
fi
