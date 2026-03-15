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

check_promptfoo_connectivity() {
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  if ! curl -fsS --max-time 8 "https://api.promptfoo.app/version" >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Warning: Unable to reach https://api.promptfoo.app/version.
Remote generation/grading may fail (Cloudflare/firewall/proxy/network block).
If this happens, see: https://www.promptfoo.dev/docs/red-team/troubleshooting/remote-generation/
EOF
  fi
}

find_generated_report() {
  local newest=""
  local candidate
  for candidate in "$@"; do
    if [[ -f "$candidate" ]]; then
      if [[ -z "$newest" || "$candidate" -nt "$newest" ]]; then
        newest="$candidate"
      fi
    fi
  done

  if [[ -n "$newest" ]]; then
    echo "$newest"
    return 0
  fi

  return 1
}

archive_generated_report() {
  local source_path="$1"
  local destination_path="$2"
  local latest_alias_path="$3"
  local final_path="$destination_path"

  mkdir -p "$(dirname "$destination_path")"

  if [[ -e "$final_path" ]]; then
    final_path="${destination_path%.yaml}-${RANDOM}.yaml"
  fi

  if ! mv "$source_path" "$final_path" 2>/dev/null; then
    if cp "$source_path" "$final_path" 2>/dev/null; then
      rm -f "$source_path" >/dev/null 2>&1 || true
    else
      echo "Warning: could not archive generated report from '$source_path' to '$final_path'." >&2
      return 1
    fi
  fi

  cp "$final_path" "$latest_alias_path" 2>/dev/null || {
    echo "Warning: could not update latest report alias at '$latest_alias_path'." >&2
    return 1
  }

  echo "$final_path"
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

if [[ ! -f "$EVAL_SERVER" ]]; then
  echo "Error: evaluation server not found: $EVAL_SERVER" >&2
  exit 1
fi

mkdir -p "$REPORTS_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TIMESTAMPED_REPORT="${REPORTS_DIR}/redteam-${MODE}-${TIMESTAMP}.yaml"
LATEST_REPORT="${REPORTS_DIR}/redteam-latest.yaml"
GENERATED_REPORT="${SCRIPT_DIR}/redteam.yaml"
FALLBACK_GENERATED_REPORT="${PROJECT_ROOT}/redteam.yaml"
CONFIG_GENERATED_REPORT="${CONFIG_DIR}/redteam.yaml"

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

check_promptfoo_connectivity

echo "Running Promptfoo red-team scan..."
cd "$SCRIPT_DIR"

# Step 1: Generate test cases (Remote allowed)
echo "Step 1: Generating test cases..."
npx promptfoo@latest redteam generate --config "$CONFIG_PATH" --output "$GENERATED_REPORT" --force

# Step 2: Clean assertions (Replace remote redteam graders with local javascript grader)
echo "Step 2: Cleaning assertions..."
node "${SCRIPT_DIR}/scripts/clean_assertions.mjs" "$GENERATED_REPORT" "${SCRIPT_DIR}/scripts/local_grader.mjs"

# Step 3: Run evaluation (Local grading forced)
echo "Step 3: Running evaluation with local grader..."
npx promptfoo@latest eval --config "$GENERATED_REPORT" --no-cache

if GENERATED_REPORT="$(find_generated_report "$GENERATED_REPORT" "$FALLBACK_GENERATED_REPORT" "$CONFIG_GENERATED_REPORT")"; then
  if ARCHIVED_REPORT_PATH="$(archive_generated_report "$GENERATED_REPORT" "$TIMESTAMPED_REPORT" "$LATEST_REPORT")"; then
    echo "Saved report: ${ARCHIVED_REPORT_PATH}"
    echo "Latest report: ${LATEST_REPORT}"
  fi
else
  echo "Warning: Promptfoo finished but no redteam.yaml output file was found." >&2
fi

echo "AI audit completed."
echo "View results: cd \"$PROJECT_ROOT\" && npx promptfoo@latest view --config \"$CONFIG_PATH\""
