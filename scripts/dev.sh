#!/usr/bin/env bash
set -euo pipefail

TASK="${1:-help}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/dev.sh <task>

Tasks:
  help       Show this help
  install    Install web dependencies
  dev        Start Next.js dev server
  start      Start built Next.js server
  test       Run web tests
  typecheck  Run TypeScript typecheck
  build      Build web app
  verify     Run typecheck + test + build
EOF
}

load_root_env() {
  if [ -f "$ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ROOT/.env"
    set +a
  fi
}

run_web() {
  load_root_env
  cd "$WEB_DIR"
  "$@"
}

case "$TASK" in
  help)
    print_help
    ;;
  install)
    run_web npm install
    ;;
  dev)
    run_web npm run dev
    ;;
  start)
    run_web npm run start
    ;;
  test)
    run_web npm test
    ;;
  typecheck)
    run_web npm run typecheck
    ;;
  build)
    run_web npm run build
    ;;
  verify)
    run_web npm run verify
    ;;
  *)
    echo "Unknown task: $TASK" >&2
    print_help
    exit 1
    ;;
esac
