#!/usr/bin/env bash
set -euo pipefail

TASK="help"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/apps/trip-api-go"
APP_DIR="$ROOT/apps/mobile-ios"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/dev.sh --task <task>
  bash scripts/dev.sh <task>

Tasks:
  help          Show this help
  up-local      Print backend + iOS startup commands
  backend-dev   Start Go backend (trip-api-go)
  app-dev       Install deps and start iOS app (mobile-ios)
  backend-test  Run Go backend tests
  ios-typecheck Run iOS TypeScript typecheck
  verify-fast   Run backend-test + ios-typecheck
  smoke         Run backend mainline smoke
  verify        Run verify-fast + smoke
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
    help|up-local|backend-dev|app-dev|backend-test|ios-typecheck|verify-fast|smoke|verify)
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

task_up_local() {
  cat <<'EOF'
Start backend in terminal A:
  cd apps/trip-api-go
  go run ./cmd/trip-api-go

Start iOS app in terminal B:
  cd apps/mobile-ios
  npm install
  npm run ios

Fast verification:
  bash scripts/dev.sh verify-fast

Full mainline smoke:
  bash scripts/dev.sh smoke

Health:
  http://127.0.0.1:8080/api/v1/health
EOF
}

task_backend_dev() {
  ensure_command "go" "Install Go from https://go.dev/dl/"
  step "Starting trip-api-go"
  run_in_dir "$BACKEND_DIR" go run ./cmd/trip-api-go
}

task_app_dev() {
  ensure_command "npm" "Install Node.js from https://nodejs.org/"
  step "Installing iOS app dependencies"
  run_in_dir "$APP_DIR" npm install
  step "Starting mobile-ios"
  run_in_dir "$APP_DIR" npm run ios
}

task_backend_test() {
  ensure_command "go" "Install Go from https://go.dev/dl/"
  step "Running Go backend tests"
  run_in_dir "$BACKEND_DIR" go test ./...
}

task_ios_typecheck() {
  ensure_command "npm" "Install Node.js from https://nodejs.org/"
  step "Running iOS TypeScript typecheck"
  run_in_dir "$APP_DIR" npm run typecheck
}

task_verify_fast() {
  step "Running fast verification"
  task_backend_test
  task_ios_typecheck
}

task_smoke() {
  ensure_command "bash" "bash is required to run the smoke script."
  step "Running backend mainline smoke"
  run_in_dir "$ROOT" bash scripts/smoke/run-local-e2e.sh --user-id smoke-user --destination 上海
}

task_verify() {
  step "Running full local verification"
  task_verify_fast
  task_smoke
}

case "$TASK" in
  help)
    print_help
    ;;
  up-local)
    task_up_local
    ;;
  backend-dev)
    task_backend_dev
    ;;
  app-dev)
    task_app_dev
    ;;
  backend-test)
    task_backend_test
    ;;
  ios-typecheck)
    task_ios_typecheck
    ;;
  verify-fast)
    task_verify_fast
    ;;
  smoke)
    task_smoke
    ;;
  verify)
    task_verify
    ;;
  *)
    echo "Unknown task: $TASK" >&2
    print_help
    exit 1
    ;;
esac
