#!/usr/bin/env bash
# run_ai_audit.sh — StreamVault Comprehensive Audit Suite
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/config"
REPORTS_DIR="${SCRIPT_DIR}/reports/ai"
EVAL_SERVER="${SCRIPT_DIR}/scripts/mock-eval-server.mjs"
SEO_SCRIPT="${SCRIPT_DIR}/scripts/seo_a11y_audit.mjs"
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
header()  { echo -e "\n${BOLD}=== $1 ===${RESET}\n"; }

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
  --fail-fast      Exit immediately if any phase fails.
  -h, --help       Show this help.
EOF
}

# ─── Arg parsing ──────────────────────────────────────────────────────────────

DRY_RUN=false
SKIP_GENERATE=false
FAIL_FAST=false
MODE="${DEFAULT_MODE}"

for arg in "$@"; do
  case "$arg" in
    full|minimal)     MODE="$arg" ;;
    --dry-run)        DRY_RUN=true ;;
    --skip-generate)  SKIP_GENERATE=true ;;
    --fail-fast)      FAIL_FAST=true ;;
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
require_command npm

if [[ ! -f "$CONFIG_PATH" ]];  then error "Config not found: $CONFIG_PATH";        exit 1; fi
if [[ ! -f "$EVAL_SERVER" ]];  then error "Eval server not found: $EVAL_SERVER";   exit 1; fi

mkdir -p "$REPORTS_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TIMESTAMPED_REPORT="${REPORTS_DIR}/redteam-${MODE}-${TIMESTAMP}.yaml"
LATEST_REPORT="${REPORTS_DIR}/redteam-latest.yaml"
GENERATED_REPORT="${SCRIPT_DIR}/redteam.yaml"
FALLBACK_GENERATED_REPORT="${PROJECT_ROOT}/redteam.yaml"
CONFIG_GENERATED_REPORT="${CONFIG_DIR}/redteam.yaml"

# ─── Tracker ──────────────────────────────────────────────────────────────────
declare -A AUDIT_RESULTS

record_result() {
  local phase="$1"
  local exit_code="$2"
  if [[ "$exit_code" -eq 0 ]]; then
    AUDIT_RESULTS["$phase"]="${GREEN}PASS${RESET}"
  else
    AUDIT_RESULTS["$phase"]="${RED}FAIL${RESET}"
    if $FAIL_FAST; then
      error "Phase '$phase' failed and --fail-fast is enabled. Aborting."
      cleanup
      exit "$exit_code"
    fi
  fi
}

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

# ─── Main Execution ───────────────────────────────────────────────────────────

echo -e "${BOLD}\nStreamVault Comprehensive Audit Suite${RESET} (mode: ${MODE})\n"

cd "$PROJECT_ROOT" || exit 1

# --- Phase 1: Code Quality ---
header "Phase 1: Code Quality & Type Safety"
info "Running ESLint..."
npm run lint
record_result "Linting" $?

info "Running TypeScript compiler..."
npx tsc --noEmit
record_result "TypeCheck" $?

# --- Phase 2: Security Audit ---
header "Phase 2: Dependency Security Audit"
info "Running npm audit (High & Critical)..."
npm audit --audit-level=high
# Ignore typical npm audit failure codes for tracking, but log it
npm_audit_code=$?
if [[ $npm_audit_code -eq 0 ]]; then
  success "No high/critical vulnerabilities found."
  record_result "Security Audit" 0
else
  warn "Vulnerabilities detected by npm audit."
  record_result "Security Audit" $npm_audit_code
fi

# --- Phase 3: Build Verification ---
header "Phase 3: Production Build Verification"
info "Executing production build..."
npm run build
record_result "Build Verification" $?

# --- Phase 4: Static SEO & Accessibility ---
header "Phase 4: SEO & Accessibility Static Analysis"
if [[ -f "$SEO_SCRIPT" ]]; then
  node "$SEO_SCRIPT"
  seo_code=$?
  record_result "SEO & A11y" $seo_code
else
  warn "SEO Script not found at $SEO_SCRIPT"
  record_result "SEO & A11y" 1
fi

# --- Phase 5: AI Red Team (Promptfoo) ---
header "Phase 5: AI Red Team Evaluation"
export PROMPTFOO_SKIP_TELEMETRY=1

info "Starting mock evaluation server..."
node "$EVAL_SERVER" > "${SCRIPT_DIR}/mock-server.log" 2>&1 &
SERVER_PID=$!
wait_for_server

if ! $SKIP_GENERATE; then
  info "Generating AI Red Team test cases..."
  cd "$SCRIPT_DIR"
  npx promptfoo@latest redteam generate \
    --config "$CONFIG_PATH" \
    --output "$GENERATED_REPORT" \
    --force

  info "Cleaning remote assertions..."
  if ! node "${SCRIPT_DIR}/scripts/clean_assertions.mjs" \
      "$GENERATED_REPORT" \
      "${SCRIPT_DIR}/scripts/local_grader.mjs"; then
    error "clean_assertions.mjs failed."
    record_result "AI Generation" 1
  else
    success "Assertions cleaned."
    record_result "AI Generation" 0
  fi
else
  info "Skipping AI generation phase (--skip-generate)."
  record_result "AI Generation" 0
fi

if $DRY_RUN; then
  info "Skipping AI evaluation (--dry-run)."
  record_result "AI Evaluation" 0
else
  info "Running AI evaluation with local grader..."
  cd "$SCRIPT_DIR"
  EVAL_EXIT=0
  npx promptfoo@latest eval \
    --config "$GENERATED_REPORT" \
    --no-cache \
    -j 8 || EVAL_EXIT=$?

  if [[ $EVAL_EXIT -ne 0 ]]; then
    warn "Promptfoo eval exited with code ${EVAL_EXIT} — expected if vulnerabilities found."
    record_result "AI Evaluation" $EVAL_EXIT
  else
    success "Evaluation complete."
    record_result "AI Evaluation" 0
  fi

  # Helper for archiving
  final_dest="$TIMESTAMPED_REPORT"
  [[ -e "$final_dest" ]] && final_dest="${TIMESTAMPED_REPORT%.yaml}-${RANDOM}.yaml"

  if mv -f "$GENERATED_REPORT" "$final_dest" 2>/dev/null || { cp -f "$GENERATED_REPORT" "$final_dest" && rm -f "$GENERATED_REPORT"; }; then
    cp -f "$final_dest" "$LATEST_REPORT" 2>/dev/null || true
    success "Saved AI Red Team report:  ${final_dest}"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

header "Audit Suite Summary"
printf "%-25s | %s\n" "Phase" "Status"
printf "%s\n" "--------------------------------------"
for phase in "Linting" "TypeCheck" "Security Audit" "Build Verification" "SEO & A11y" "AI Generation" "AI Evaluation"; do
  if [[ -n "${AUDIT_RESULTS[$phase]:-}" ]]; then
    printf "%-25s | %b\n" "$phase" "${AUDIT_RESULTS[$phase]}"
  fi
done
echo ""
echo -e "${BOLD}Detailed AI Red Team results can be viewed via:${RESET}"
echo "  npx promptfoo@latest view"
echo "Done."
 # npx promptfoo@latest share
