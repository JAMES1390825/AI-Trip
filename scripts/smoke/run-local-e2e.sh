#!/usr/bin/env bash
set -euo pipefail

USER_ID="smoke-user"
DESTINATION="上海"
BOOTSTRAP_SECRET="dev-bootstrap-secret"
ENV_FILE=""

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/smoke/run-local-e2e.sh [options]

Options:
  --user-id <id>                 User ID used for smoke requests
  --destination <name>           Destination city used for smoke requests
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
CURRENT_STAGE="bootstrap"

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

print_log_locations() {
  echo "trip-api stdout log: $TRIP_API_OUT_LOG" >&2
  echo "trip-api stderr log: $TRIP_API_ERR_LOG" >&2
}

fail() {
  local message="$1"
  echo "smoke failed during stage: $CURRENT_STAGE" >&2
  echo "$message" >&2
  print_log_locations
  exit 1
}

load_env_file() {
  local path="$1"
  local count=0
  local line key value

  if [[ ! -f "$path" ]]; then
    echo "Env file not found at $path; continuing with current shell env." >&2
    return
  fi

  echo "Using env file: $path"

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
      tail -n 40 "$TRIP_API_ERR_LOG" >&2 || true
      fail "service not ready: $url"
    fi
    sleep 0.8
  done
}

invoke_api_json() {
  local stage="$1"
  local method="$2"
  local url="$3"
  local token="${4:-}"
  local body="${5:-}"
  local tmp_response status
  local -a args

  CURRENT_STAGE="$stage"
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
    echo "request failed during [$stage] [$method $url]: HTTP $status" >&2
    cat "$tmp_response" >&2
    rm -f "$tmp_response"
    print_log_locations
    exit 1
  fi

  cat "$tmp_response"
  rm -f "$tmp_response"
}

json_get() {
  local path="$1"
  node -e '
const path = (process.argv[1] || "").split(".").filter(Boolean);
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  if (!raw.trim()) {
    process.stdout.write("");
    return;
  }
  let cur = JSON.parse(raw);
  for (const part of path) {
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else if (cur && typeof cur === "object") {
      cur = cur[part];
    } else {
      cur = undefined;
      break;
    }
  }
  if (cur === undefined || cur === null) {
    process.stdout.write("");
  } else if (typeof cur === "object") {
    process.stdout.write(JSON.stringify(cur));
  } else {
    process.stdout.write(String(cur));
  }
});
' "$path"
}

ensure_command "go" "Install Go from https://go.dev/dl/ and make sure it is on PATH."
ensure_command "curl" "Install curl and make sure it is on PATH."
ensure_command "node" "Install Node.js and make sure it is on PATH."

load_env_file "$ENV_FILE"

echo "trip-api stdout log: $TRIP_API_OUT_LOG"
echo "trip-api stderr log: $TRIP_API_ERR_LOG"

CURRENT_STAGE="start-trip-api"
echo "[1/7] Starting trip-api on :8080 ..."
(
  cd "$TRIP_API_DIR"
  BOOTSTRAP_CLIENT_SECRET="$BOOTSTRAP_SECRET" go run ./cmd/trip-api-go
) >"$TRIP_API_OUT_LOG" 2>"$TRIP_API_ERR_LOG" &
trip_api_pid="$!"

CURRENT_STAGE="wait-health"
wait_http_ready "http://127.0.0.1:8080/api/v1/health" 120
echo "[2/7] trip-api is healthy."

BASE_URL="http://127.0.0.1:8080"
DESTINATION_QUERY="$(node -p "encodeURIComponent(process.argv[1])" "$DESTINATION")"
echo "[3/7] Issuing token ..."
token_response="$(invoke_api_json "issue-token" "POST" "$BASE_URL/api/v1/auth/token" "" "{\"user_id\":\"$USER_ID\",\"role\":\"USER\",\"client_secret\":\"$BOOTSTRAP_SECRET\"}")"
ACCESS_TOKEN="$(printf '%s' "$token_response" | json_get "access_token")"
if [[ -z "$ACCESS_TOKEN" ]]; then
  fail "failed to receive access token"
fi

echo "[4/7] Resolving destination and building planning brief ..."
resolved="$(invoke_api_json "resolve-destination" "GET" "$BASE_URL/api/v1/destinations/resolve?q=$DESTINATION_QUERY&limit=5" "$ACCESS_TOKEN" "")"
selected_destination="$(printf '%s' "$resolved" | json_get "items.0")"
if [[ -z "$selected_destination" ]]; then
  CURRENT_STAGE="resolve-destination"
  fail "failed to resolve destination"
fi

brief_body="$(cat <<JSON
{
  "origin_city":"上海",
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
brief="$(invoke_api_json "build-brief" "POST" "$BASE_URL/api/v1/plans/brief" "$ACCESS_TOKEN" "$brief_body")"
planning_brief="$(printf '%s' "$brief" | json_get "planning_brief")"
ready_to_generate="$(printf '%s' "$brief" | json_get "planning_brief.ready_to_generate")"
if [[ "$ready_to_generate" != "true" ]]; then
  CURRENT_STAGE="build-brief"
  echo "planning brief is not ready_to_generate" >&2
  printf '%s\n' "$brief" >&2
  fail "planning brief is not ready_to_generate"
fi

echo "[5/7] Generating, validating, and saving itinerary ..."
generated="$(invoke_api_json "generate-v2" "POST" "$BASE_URL/api/v1/plans/generate-v2" "$ACCESS_TOKEN" "{\"planning_brief\":$planning_brief,\"options\":{\"variants\":1,\"allow_fallback\":true}}")"
itinerary="$(printf '%s' "$generated" | json_get "plans.0.itinerary")"
if [[ -z "$itinerary" ]]; then
  CURRENT_STAGE="generate-v2"
  echo "generate-v2 did not return itinerary" >&2
  printf '%s\n' "$generated" >&2
  fail "generate-v2 did not return itinerary"
fi

validated="$(invoke_api_json "validate-itinerary" "POST" "$BASE_URL/api/v1/plans/validate" "$ACCESS_TOKEN" "{\"itinerary\":$itinerary,\"strict\":false}")"
saved="$(invoke_api_json "save-plan" "POST" "$BASE_URL/api/v1/plans/save" "$ACCESS_TOKEN" "{\"itinerary\":$itinerary}")"
SAVED_ID="$(printf '%s' "$saved" | json_get "id")"
if [[ -z "$SAVED_ID" ]]; then
  SAVED_ID="$(printf '%s' "$saved" | json_get "saved_plan_id")"
fi
if [[ -z "$SAVED_ID" ]]; then
  CURRENT_STAGE="save-plan"
  fail "saved plan id is missing"
fi

echo "[6/7] Loading saved plan history and deleting saved plan ..."
history="$(invoke_api_json "list-saved" "GET" "$BASE_URL/api/v1/plans/saved?limit=20" "$ACCESS_TOKEN" "")"
loaded="$(invoke_api_json "load-saved-detail" "GET" "$BASE_URL/api/v1/plans/saved/$SAVED_ID" "$ACCESS_TOKEN" "")"
invoke_api_json "delete-saved" "DELETE" "$BASE_URL/api/v1/plans/saved/$SAVED_ID" "$ACCESS_TOKEN" "" >/dev/null
history_after_delete="$(invoke_api_json "list-saved-after-delete" "GET" "$BASE_URL/api/v1/plans/saved?limit=20" "$ACCESS_TOKEN" "")"
GENERATED_DEGRADED="$(printf '%s' "$generated" | json_get "degraded")"
ITINERARY_CONFIDENCE="$(printf '%s' "$itinerary" | json_get "confidence")"
VALIDATION_PASSED="$(printf '%s' "$validated" | json_get "validation_result.passed")"
VALIDATION_TIER="$(printf '%s' "$validated" | json_get "validation_result.confidence_tier")"
LOADED_DESTINATION="$(printf '%s' "$loaded" | json_get "itinerary.destination")"

HISTORY_COUNT="$(printf '%s' "$history" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(raw || "null");
  if (Array.isArray(data)) {
    process.stdout.write(String(data.length));
    return;
  }
  const items = data && Array.isArray(data.items) ? data.items.length : 0;
  process.stdout.write(String(items));
});
')"

POST_DELETE_HISTORY_COUNT="$(printf '%s' "$history_after_delete" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(raw || "null");
  if (Array.isArray(data)) {
    process.stdout.write(String(data.length));
    return;
  }
  const items = data && Array.isArray(data.items) ? data.items.length : 0;
  process.stdout.write(String(items));
});
')"

POST_DELETE_STILL_PRESENT="$(printf '%s' "$history_after_delete" | node -e '
const savedId = process.argv[1];
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(raw || "null");
  const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : [];
  const present = items.some((item) => String((item && item.id) || "") === savedId);
  process.stdout.write(present ? "true" : "false");
});
' "$SAVED_ID")"

if [[ "$POST_DELETE_STILL_PRESENT" == "true" ]]; then
  CURRENT_STAGE="list-saved-after-delete"
  fail "saved plan still present in history after delete"
fi

CURRENT_STAGE="check-deleted-detail"
deleted_detail_status="$(curl --silent --show-error \
  --output /dev/null \
  --write-out "%{http_code}" \
  --request GET \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/api/v1/plans/saved/$SAVED_ID")"

if [[ "$deleted_detail_status" != "404" ]]; then
  fail "deleted saved plan detail still accessible: HTTP $deleted_detail_status"
fi

CURRENT_STAGE="complete"
echo "[7/7] Smoke flow complete."
node -e '
const payload = {
  user_id: process.argv[1],
  destination: process.argv[2],
  generated_degraded: process.argv[3],
  itinerary_confidence: process.argv[4],
  validation_passed: process.argv[5],
  validation_confidence_tier: process.argv[6],
  saved_plan_id: process.argv[7],
  history_count: Number(process.argv[8]),
  post_delete_history_count: Number(process.argv[9]),
  loaded_destination: process.argv[10],
  trip_api_stdout_log: process.argv[11],
  trip_api_stderr_log: process.argv[12],
};
console.log(JSON.stringify(payload, null, 2));
' "$USER_ID" "$DESTINATION" "$GENERATED_DEGRADED" "$ITINERARY_CONFIDENCE" "$VALIDATION_PASSED" "$VALIDATION_TIER" "$SAVED_ID" "$HISTORY_COUNT" "$POST_DELETE_HISTORY_COUNT" "$LOADED_DESTINATION" "$TRIP_API_OUT_LOG" "$TRIP_API_ERR_LOG"
