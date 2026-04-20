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
  up-local     Print backend + iOS startup commands
  backend-dev  Start Go backend (trip-api-go)
  app-dev      Install deps and start iOS app (mobile-ios)
  smoke        Run backend mainline smoke
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
    help|up-local|backend-dev|app-dev|smoke)
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
APP_DIR="$ROOT/apps/mobile-ios"

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
Start backend in terminal A:
  cd apps/trip-api-go
  go run ./cmd/trip-api-go

Start iOS app in terminal B:
  cd apps/mobile-ios
  npm install
  npm run ios

Health:
  http://127.0.0.1:8080/api/v1/health
EOF
    ;;
  backend-dev)
    ensure_command "go" "Install Go from https://go.dev/dl/"
    step "Starting trip-api-go"
    run_in_dir "$BACKEND_DIR" go run ./cmd/trip-api-go
    ;;
  app-dev)
    ensure_command "npm" "Install Node.js from https://nodejs.org/"
    step "Installing iOS app dependencies"
    run_in_dir "$APP_DIR" npm install
    step "Starting mobile-ios"
    run_in_dir "$APP_DIR" npm run ios
    ;;
  smoke)
    ensure_command "bash" "bash is required to run the smoke script."
    step "Running backend mainline smoke"
    run_in_dir "$ROOT" bash scripts/smoke/run-local-e2e.sh --user-id smoke-user --destination 上海
    ;;
  *)
    echo "Unknown task: $TASK" >&2
    print_help
    exit 1
    ;;
esac
