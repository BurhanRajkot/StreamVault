#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/config"
REPORTS_DIR="${SCRIPT_DIR}/reports/ai"
EVAL_SERVER="${SCRIPT_DIR}/scripts/mock-eval-server.mjs"
DEFAULT_MODE="full"

usage() {
  cat <<'EOF'
Usage: ./audit/run_ai_audit.sh [full|minimal]

Modes:
  full     Uses the complete red-team plugin set (default).
  minimal  Uses a lightweight config for faster smoke checks.
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' is not installed or not on PATH." >&2
    exit 1
  fi
}

wait_for_server() {
  if ! command -v curl >/dev/null 2>&1; then
    sleep 3
    return 0
  fi

  local i
  for i in {1..20}; do
    if curl -sS -X POST "http://localhost:4001/api/recommendations/eval" \
      -H "Content-Type: application/json" \
      -d '{"recentTitles":["Smoke Test"],"topGenreNames":["Drama"]}' \
      >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "${SERVER_PID:-}" ]] && ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      echo "Warning: evaluation server exited before readiness check; continuing scan." >&2
      return 0
    fi
    sleep 0.5
  done

  echo "Warning: could not verify evaluation server readiness; continuing scan." >&2
  return 0
}

MODE="${1:-$DEFAULT_MODE}"
case "$MODE" in
  full)
    CONFIG_PATH="${CONFIG_DIR}/promptfoo-redteam-full.yaml"
    ;;
  minimal)
    CONFIG_PATH="${CONFIG_DIR}/promptfoo-redteam-minimal.yaml"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Error: unknown mode '$MODE'." >&2
    usage
    exit 1
    ;;
esac

require_command node
require_command npx

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Error: config file not found: $CONFIG_PATH" >&2
  exit 1
fi

mkdir -p "$REPORTS_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TIMESTAMPED_REPORT="${REPORTS_DIR}/redteam-${MODE}-${TIMESTAMP}.yaml"
LATEST_REPORT="${REPORTS_DIR}/redteam-latest.yaml"
GENERATED_REPORT="${SCRIPT_DIR}/redteam.yaml"

SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting StreamVault AI Red Team Audit (${MODE})..."
echo "Config: ${CONFIG_PATH}"

echo "Starting mock evaluation server..."
node "$EVAL_SERVER" > /dev/null 2>&1 &
SERVER_PID=$!
wait_for_server

echo "Running Promptfoo red-team scan..."
cd "$SCRIPT_DIR"
npx promptfoo@latest redteam run --config "$CONFIG_PATH"

if [[ -f "$GENERATED_REPORT" ]]; then
  mv "$GENERATED_REPORT" "$TIMESTAMPED_REPORT"
  cp "$TIMESTAMPED_REPORT" "$LATEST_REPORT"
  echo "Saved report: ${TIMESTAMPED_REPORT}"
  echo "Latest report: ${LATEST_REPORT}"
fi

echo "AI audit completed."
echo "View results: cd \"$PROJECT_ROOT\" && npx promptfoo@latest view --config \"$CONFIG_PATH\""
