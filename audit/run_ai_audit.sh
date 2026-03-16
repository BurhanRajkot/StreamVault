#!/usr/bin/env bash
# run_ai_audit.sh — StreamVault AI Red Team Audit runner (upgraded)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/config"
REPORTS_DIR="${SCRIPT_DIR}/reports/ai"
EVAL_SERVER="${SCRIPT_DIR}/scripts/mock-eval-server.mjs"
DEFAULT_MODE="full"

# ─── Colour helpers ───────────────────────────────────────────────────────────

if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*" >&2; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
${BOLD}Usage:${RESET} ./audit/run_ai_audit.sh [OPTIONS] [full|minimal]

${BOLD}Modes:${RESET}
  full      Full plugin set (default).
  minimal   Lightweight config for smoke checks.

${BOLD}Options:${RESET}
  --dry-run        Generate + clean assertions, but skip evaluation.
  --skip-generate  Reuse existing redteam.yaml (skips Steps 1 & 2).
  -h, --help       Show this help.
EOF
}

# ─── Arg parsing ──────────────────────────────────────────────────────────────

DRY_RUN=false
SKIP_GENERATE=false
MODE="${DEFAULT_MODE}"

for arg in "$@"; do
  case "$arg" in
    full|minimal)     MODE="$arg" ;;
    --dry-run)        DRY_RUN=true ;;
    --skip-generate)  SKIP_GENERATE=true ;;
    -h|--help|help)   usage; exit 0 ;;
    *) error "Unknown argument: '$arg'"; usage; exit 1 ;;
  esac
done

case "$MODE" in
  full)    CONFIG_PATH="${CONFIG_DIR}/promptfoo-redteam-full.yaml" ;;
  minimal) CONFIG_PATH="${CONFIG_DIR}/promptfoo-redteam-minimal.yaml" ;;
esac

# ─── Dependency checks ────────────────────────────────────────────────────────

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command '$1' not found on PATH."
    exit 1
  fi
}

require_command node
require_command npx

if [[ ! -f "$CONFIG_PATH" ]];  then error "Config not found: $CONFIG_PATH";        exit 1; fi
if [[ ! -f "$EVAL_SERVER" ]];  then error "Eval server not found: $EVAL_SERVER";   exit 1; fi

# ─── Paths ────────────────────────────────────────────────────────────────────

mkdir -p "$REPORTS_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TIMESTAMPED_REPORT="${REPORTS_DIR}/redteam-${MODE}-${TIMESTAMP}.yaml"
LATEST_REPORT="${REPORTS_DIR}/redteam-latest.yaml"
GENERATED_REPORT="${SCRIPT_DIR}/redteam.yaml"
FALLBACK_GENERATED_REPORT="${PROJECT_ROOT}/redteam.yaml"
CONFIG_GENERATED_REPORT="${CONFIG_DIR}/redteam.yaml"

# ─── Server lifecycle ─────────────────────────────────────────────────────────

SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    info "Stopping eval server (PID ${SERVER_PID})..."
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

wait_for_server() {
  local i
  for i in {1..30}; do
    if command -v curl >/dev/null 2>&1; then
      if curl -sf "http://localhost:4001/health" >/dev/null 2>&1; then
        success "Eval server is ready."
        return 0
      fi
    else
      sleep 3; return 0
    fi

    if [[ -n "${SERVER_PID}" ]] && ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      error "Eval server (PID ${SERVER_PID}) exited unexpectedly. Check ${SCRIPT_DIR}/mock-server.log"
      exit 1
    fi
    sleep 0.5
  done

  error "Eval server did not become ready within 15 s. Check ${SCRIPT_DIR}/mock-server.log"
  exit 1
}

check_promptfoo_connectivity() {
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  if ! curl -fsS --max-time 8 "https://api.promptfoo.app/version" >/dev/null 2>&1; then
    warn "Cannot reach https://api.promptfoo.app — remote test generation may fail."
    warn "See: https://www.promptfoo.dev/docs/red-team/troubleshooting/remote-generation/"
  fi
}

# ─── Report archiving ─────────────────────────────────────────────────────────

find_generated_report() {
  local newest=""
  for candidate in "$@"; do
    if [[ -f "$candidate" ]]; then
      if [[ -z "$newest" || "$candidate" -nt "$newest" ]]; then
        newest="$candidate"
      fi
    fi
  done
  [[ -n "$newest" ]] && echo "$newest" && return 0
  return 1
}

archive_generated_report() {
  local src="$1" dest="$2" latest="$3"
  local final="$dest"

  mkdir -p "$(dirname "$dest")"
  [[ -e "$final" ]] && final="${dest%.yaml}-${RANDOM}.yaml"

  if mv "$src" "$final" 2>/dev/null || { cp "$src" "$final" && rm -f "$src"; }; then
    cp "$final" "$latest" || warn "Could not update latest alias at '$latest'."
    echo "$final"
    return 0
  fi

  warn "Could not archive report from '$src' to '$final'."
  return 1
}

# ─── Main ─────────────────────────────────────────────────────────────────────

echo -e "${BOLD}StreamVault AI Red Team Audit${RESET} (mode: ${MODE})"
info "Config: ${CONFIG_PATH}"
$DRY_RUN       && info "Dry-run mode enabled: evaluation will be skipped."
$SKIP_GENERATE && info "Skip-generate mode: reusing existing redteam.yaml."

info "Starting mock evaluation server..."
node "$EVAL_SERVER" > "${SCRIPT_DIR}/mock-server.log" 2>&1 &
SERVER_PID=$!
wait_for_server

export PROMPTFOO_SKIP_TELEMETRY=1
check_promptfoo_connectivity

if ! $SKIP_GENERATE; then
  # Step 1: Generate
  info "Step 1: Generating test cases..."
  cd "$SCRIPT_DIR"
  npx promptfoo@latest redteam generate \
    --config "$CONFIG_PATH" \
    --output "$GENERATED_REPORT" \
    --force
  success "Test cases generated → ${GENERATED_REPORT}"

  # Step 2: Clean assertions
  info "Step 2: Cleaning remote assertions..."
  if ! node "${SCRIPT_DIR}/scripts/clean_assertions.mjs" \
      "$GENERATED_REPORT" \
      "${SCRIPT_DIR}/scripts/local_grader.mjs"; then
    error "clean_assertions.mjs failed. Aborting."
    exit 1
  fi
  success "Assertions cleaned."
else
  info "Skipping Steps 1 & 2 (--skip-generate)."
fi

# Step 3: Evaluate
if $DRY_RUN; then
  info "Step 3: Skipped (--dry-run)."
else
  info "Step 3: Running evaluation with local grader..."
  EVAL_EXIT=0
  npx promptfoo@latest eval \
    --config "$GENERATED_REPORT" \
    --no-cache \
    -j 8 || EVAL_EXIT=$?

  if [[ $EVAL_EXIT -ne 0 ]]; then
    warn "Promptfoo eval exited with code ${EVAL_EXIT} — some tests may have failed (expected for red-team runs)."
  else
    success "Evaluation complete."
  fi

  if GENERATED_REPORT_PATH="$(find_generated_report "$GENERATED_REPORT" "$FALLBACK_GENERATED_REPORT" "$CONFIG_GENERATED_REPORT")"; then
    if ARCHIVED_PATH="$(archive_generated_report "$GENERATED_REPORT_PATH" "$TIMESTAMPED_REPORT" "$LATEST_REPORT")"; then
      success "Saved report:  ${ARCHIVED_PATH}"
      success "Latest alias:  ${LATEST_REPORT}"
    fi
  else
    warn "Promptfoo finished but no redteam.yaml output was found."
  fi
fi

echo ""
echo -e "${BOLD}Audit complete.${RESET}"
echo "  View:  cd \"$PROJECT_ROOT\" && npx promptfoo@latest view --config \"$CONFIG_PATH\""
echo "  Share: npx promptfoo@latest share"
