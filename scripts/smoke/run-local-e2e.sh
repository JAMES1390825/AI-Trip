#!/usr/bin/env bash
set -euo pipefail

USER_ID="smoke-user"
DESTINATION="beijing"
BOOTSTRAP_SECRET="dev-bootstrap-secret"
ENV_FILE=""

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/smoke/run-local-e2e.sh [options]

Options:
  --user-id <id>                 User ID used for smoke requests
  --destination <name>           Destination city used for generate/replan
  --bootstrap-secret <secret>    Bootstrap secret for token issuance
  --env-file <path>              Optional .env file to load before startup
  --help                         Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-id)
      USER_ID="${2:-}"
      shift 2
      ;;
    --destination)
      DESTINATION="${2:-}"
      shift 2
      ;;
    --bootstrap-secret)
      BOOTSTRAP_SECRET="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRIP_API_DIR="$ROOT/apps/trip-api-go"
LOGS_DIR="$ROOT/tmp/smoke-logs"

if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT/.env"
fi

mkdir -p "$LOGS_DIR"

TRIP_API_OUT_LOG="$LOGS_DIR/trip-api.out.log"
TRIP_API_ERR_LOG="$LOGS_DIR/trip-api.err.log"
rm -f "$TRIP_API_OUT_LOG" "$TRIP_API_ERR_LOG"

trip_api_pid=""

ensure_command() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "$name command not found. $hint" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$trip_api_pid" ]] && kill -0 "$trip_api_pid" >/dev/null 2>&1; then
    kill "$trip_api_pid" >/dev/null 2>&1 || true
    wait "$trip_api_pid" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

load_env_file() {
  local path="$1"
  local count=0
  local line key value

  if [[ ! -f "$path" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

      if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
        value="${value:1:${#value}-2}"
      fi

      export "$key=$value"
      count=$((count + 1))
    fi
  done <"$path"

  if [[ "$count" -gt 0 ]]; then
    echo "Loaded $count env vars from $path"
  fi
}

wait_http_ready() {
  local url="$1"
  local timeout_seconds="${2:-90}"
  local started now

  started="$(date +%s)"
  while true; do
    if curl --silent --show-error --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi

    now="$(date +%s)"
    if ((now - started >= timeout_seconds)); then
      echo "service not ready: $url" >&2
      return 1
    fi
    sleep 0.8
  done
}

invoke_api_json() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local body="${4:-}"
  local tmp_response status
  local -a args

  tmp_response="$(mktemp)"
  args=(
    --silent
    --show-error
    --output "$tmp_response"
    --write-out "%{http_code}"
    --request "$method"
    --header "Accept: application/json"
  )

  if [[ -n "$token" ]]; then
    args+=(--header "Authorization: Bearer $token")
  fi

  if [[ -n "$body" ]]; then
    args+=(--header "Content-Type: application/json")
    args+=(--data "$body")
  fi

  status="$(curl "${args[@]}" "$url")"

  if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
    echo "request failed [$method $url]: HTTP $status" >&2
    cat "$tmp_response" >&2
    rm -f "$tmp_response"
    return 1
  fi

  cat "$tmp_response"
  rm -f "$tmp_response"
}

json_get() {
  local path="$1"
  python3 -c '
import json
import sys

path = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    print("")
    raise SystemExit(0)

obj = json.loads(raw)
parts = [p for p in path.split(".") if p]

cur = obj
for part in parts:
    if isinstance(cur, dict):
        cur = cur.get(part)
    elif isinstance(cur, list) and part.isdigit():
        idx = int(part)
        cur = cur[idx] if 0 <= idx < len(cur) else None
    else:
        cur = None
        break

if cur is None:
    print("")
elif isinstance(cur, bool):
    print("true" if cur else "false")
elif isinstance(cur, (dict, list)):
    print(json.dumps(cur, ensure_ascii=False))
else:
    print(cur)
' "$path"
}

ensure_command "go" "Install Go from https://go.dev/dl/ and make sure it is on PATH."
ensure_command "curl" "Install curl and make sure it is on PATH."
ensure_command "python3" "Python 3 is required for JSON parsing in this smoke script."

load_env_file "$ENV_FILE"

echo "[1/8] Starting trip-api on :8080 ..."
(
  cd "$TRIP_API_DIR"
  BOOTSTRAP_CLIENT_SECRET="$BOOTSTRAP_SECRET" go run ./cmd/trip-api-go
) >"$TRIP_API_OUT_LOG" 2>"$TRIP_API_ERR_LOG" &
trip_api_pid="$!"

wait_http_ready "http://127.0.0.1:8080/api/v1/health" 120
echo "[2/8] trip-api is healthy."

BASE_URL="http://127.0.0.1:8080"
echo "[3/8] Issuing token ..."
token_body="$(cat <<JSON
{"user_id":"$USER_ID","role":"USER","client_secret":"$BOOTSTRAP_SECRET"}
JSON
)"
token_response="$(invoke_api_json "POST" "$BASE_URL/api/v1/auth/token" "" "$token_body")"
ACCESS_TOKEN="$(printf '%s' "$token_response" | json_get "access_token")"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "failed to receive access token" >&2
  exit 1
fi

echo "[4/8] Resolving destination and building planning brief ..."
resolved="$(invoke_api_json "GET" "$BASE_URL/api/v1/destinations/resolve?q=$DESTINATION&limit=5" "$ACCESS_TOKEN" "")"
selected_destination="$(printf '%s' "$resolved" | json_get "items.0")"
if [[ -z "$selected_destination" ]]; then
  echo "failed to resolve destination" >&2
  exit 1
fi

brief_body="$(cat <<JSON
{
  "origin_city":"shanghai",
  "destination_text":"$DESTINATION",
  "selected_destination":$selected_destination,
  "days":3,
  "budget_level":"medium",
  "start_date":"2026-05-01",
  "pace":"relaxed",
  "travel_styles":["history","food"]
}
JSON
)"
brief="$(invoke_api_json "POST" "$BASE_URL/api/v1/plans/brief" "$ACCESS_TOKEN" "$brief_body")"
planning_brief="$(printf '%s' "$brief" | json_get "planning_brief")"
ready_to_generate="$(printf '%s' "$brief" | json_get "planning_brief.ready_to_generate")"
if [[ "$ready_to_generate" != "true" ]]; then
  echo "planning brief is not ready_to_generate" >&2
  printf '%s\n' "$brief" >&2
  exit 1
fi

echo "[5/8] Generating and validating itinerary ..."
generate_body="$(cat <<JSON
{"planning_brief":$planning_brief,"options":{"variants":1,"allow_fallback":true}}
JSON
)"
generated="$(invoke_api_json "POST" "$BASE_URL/api/v1/plans/generate-v2" "$ACCESS_TOKEN" "$generate_body")"
itinerary="$(printf '%s' "$generated" | json_get "plans.0.itinerary")"
if [[ -z "$itinerary" ]]; then
  echo "generate-v2 did not return itinerary" >&2
  printf '%s\n' "$generated" >&2
  exit 1
fi
validated="$(invoke_api_json "POST" "$BASE_URL/api/v1/plans/validate" "$ACCESS_TOKEN" "{\"itinerary\":$itinerary,\"strict\":false}")"

echo "[6/8] Saving and recording event ..."
save_body="$(cat <<JSON
{"itinerary":$itinerary}
JSON
)"
saved="$(invoke_api_json "POST" "$BASE_URL/api/v1/plans/save" "$ACCESS_TOKEN" "$save_body")"
SAVED_ID="$(printf '%s' "$saved" | json_get "id")"
history="$(invoke_api_json "GET" "$BASE_URL/api/v1/plans/saved?limit=20" "$ACCESS_TOKEN" "")"
loaded="$(invoke_api_json "GET" "$BASE_URL/api/v1/plans/saved/$SAVED_ID" "$ACCESS_TOKEN" "")"
summary="$(invoke_api_json "GET" "$BASE_URL/api/v1/plans/saved/$SAVED_ID/summary" "$ACCESS_TOKEN" "")"
invoke_api_json "POST" "$BASE_URL/api/v1/events" "$ACCESS_TOKEN" '{"event_name":"mainline_smoke_checked","metadata":{"source":"run-local-e2e"}}' >/dev/null

echo "[7/8] Validating smoke result payload."
if [[ -z "$SAVED_ID" ]]; then
  echo "saved plan id is missing" >&2
  exit 1
fi

GENERATED_DEGRADED="$(printf '%s' "$generated" | json_get "degraded")"
ITINERARY_CONFIDENCE="$(printf '%s' "$itinerary" | json_get "confidence")"
VALIDATION_PASSED="$(printf '%s' "$validated" | json_get "validation_result.passed")"
VALIDATION_TIER="$(printf '%s' "$validated" | json_get "validation_result.confidence_tier")"
LOADED_DESTINATION="$(printf '%s' "$loaded" | json_get "itinerary.destination")"
HISTORY_COUNT="$(printf '%s' "$history" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else len(data.get("items", [])) if isinstance(data, dict) and isinstance(data.get("items"), list) else 0)')"
SUMMARY_PREVIEW="$(printf '%s' "$summary" | python3 -c 'import json,sys; text=str(json.load(sys.stdin).get("summary","")); print(text[:80])')"

echo "[8/8] Smoke flow complete."
python3 - "$USER_ID" "$GENERATED_DEGRADED" "$ITINERARY_CONFIDENCE" "$VALIDATION_PASSED" "$VALIDATION_TIER" "$SAVED_ID" "$HISTORY_COUNT" "$LOADED_DESTINATION" "$SUMMARY_PREVIEW" "$TRIP_API_OUT_LOG" "$TRIP_API_ERR_LOG" <<'PY'
import json
import sys

payload = {
    "user_id": sys.argv[1],
    "generated_degraded": sys.argv[2],
    "itinerary_confidence": sys.argv[3],
    "validation_passed": sys.argv[4],
    "validation_confidence_tier": sys.argv[5],
    "saved_plan_id": sys.argv[6],
    "history_count": int(sys.argv[7]),
    "loaded_destination": sys.argv[8],
    "summary_preview": sys.argv[9],
    "trip_api_stdout_log": sys.argv[10],
    "trip_api_stderr_log": sys.argv[11],
}
print(json.dumps(payload, ensure_ascii=False, indent=2))
PY
