#!/usr/bin/env bash
set -euo pipefail

TASK="help"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/dev.sh --task <task>
  bash scripts/dev.sh <task>

Tasks:
  help         Show this help
  up-local     Print independent backend/admin start commands
  ai-service-dev Start Python AI service (trip-ai-service)
  backend-dev  Start Go backend (trip-api-go)
  frontend-dev Install deps and start admin console (web-client)
  smoke        Basic smoke check (health + auth token)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task|-t)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      TASK="$2"
      shift 2
      ;;
    help|up-local|ai-service-dev|backend-dev|frontend-dev|smoke)
      TASK="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/apps/trip-api-go"
AI_SERVICE_DIR="$ROOT/apps/trip-ai-service"
FRONTEND_DIR="$ROOT/apps/web-client"

step() {
  printf '\n==> %s\n' "$1"
}

run_in_dir() {
  local workdir="$1"
  shift

  (
    cd "$workdir"
    printf -- '->'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
    "$@"
  )
}

ensure_command() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "$name is not installed or not in PATH. $hint" >&2
    exit 1
  fi
}

case "$TASK" in
  help)
    print_help
    ;;
  up-local)
    cat <<'EOF'
Start AI service in terminal A:
  cd apps/trip-ai-service
  export BAILIAN_API_KEY=your-bailian-key
  python3 main.py

Start backend in terminal B:
  cd apps/trip-api-go
  export AI_SERVICE_BASE_URL=http://127.0.0.1:8091
  go run ./cmd/trip-api-go

Start admin console in terminal C:
  cd apps/web-client
  npm install
  npm run dev -- --host 127.0.0.1 --port 5500

Open:
  Admin:    http://127.0.0.1:5500
  Trip API: http://127.0.0.1:8080/api/v1/health
EOF
    ;;
  ai-service-dev)
    ensure_command "python3" "Install Python 3 from https://www.python.org/downloads/"
    step "Starting trip-ai-service"
    run_in_dir "$AI_SERVICE_DIR" python3 main.py
    ;;
  backend-dev)
    ensure_command "go" "Install Go from https://go.dev/dl/"
    step "Starting trip-api-go"
    run_in_dir "$BACKEND_DIR" go run ./cmd/trip-api-go
    ;;
  frontend-dev)
    ensure_command "npm" "Install Node.js from https://nodejs.org/"
    step "Installing admin console dependencies"
    run_in_dir "$FRONTEND_DIR" npm install
    step "Starting web-client"
    run_in_dir "$FRONTEND_DIR" npm run dev -- --host 127.0.0.1 --port 5500
    ;;
  smoke)
    ensure_command "curl" "Install curl and make it available in PATH."
    step "Running basic smoke checks"

    health="$(curl --silent --show-error --fail "http://127.0.0.1:8080/api/v1/health")"
    printf 'health => %s\n' "$health"

    tmp_response="$(mktemp)"
    status="$(curl --silent --show-error \
      --output "$tmp_response" \
      --write-out '%{http_code}' \
      --request POST \
      --header "Content-Type: application/json" \
      --data '{"user_id":"smoke-user","role":"USER","client_secret":"dev-bootstrap-secret"}' \
      "http://127.0.0.1:8080/api/v1/auth/token")"

    if [[ "$status" != "200" ]]; then
      echo "auth/token failed with HTTP $status" >&2
      cat "$tmp_response" >&2
      rm -f "$tmp_response"
      exit 1
    fi

    printf 'auth/token => %s\n' "$status"
    rm -f "$tmp_response"
    ;;
  *)
    echo "Unknown task: $TASK" >&2
    print_help
    exit 1
    ;;
esac
