#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  StreamVault — Step 9: Inject Secrets + Deploy with ArgoCD
#  Run AFTER setup.sh completes and you have your secret values ready.
#  Usage: bash k8s/inject-secrets.sh
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✅ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $*${RESET}"; }
ask()  { echo -e "${YELLOW}${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
  ____                     _
 / ___|  ___  ___ _ __ ___| |_ ___
 \___ \ / _ \/ __| '__/ _ \ __/ __|
  ___) |  __/ (__| | |  __/ |_\__ \
 |____/ \___|\___|_|  \___|\__|___/
  Injector — Step 9 of StreamVault K8s Setup
EOF
echo -e "${RESET}"

# ════════════════════════════════════════════════════════════════════
# Collect secrets interactively
# ════════════════════════════════════════════════════════════════════
step "Collecting secret values (from your Render dashboard)"
warn "These values will NOT be saved to any file. They go straight into the cluster."
echo ""

prompt_secret() {
  local VAR_NAME="$1"
  local DESCRIPTION="$2"
  local DEFAULT_VALUE="$3"
  local VALUE=""
  if [ -n "$DEFAULT_VALUE" ]; then
    echo -ne "${BOLD}${VAR_NAME}${RESET} ${CYAN}(${DESCRIPTION})${RESET} [${DEFAULT_VALUE:0:8}...]: "
    read -r VALUE
    VALUE="${VALUE:-$DEFAULT_VALUE}"
  else
    while [ -z "$VALUE" ]; do
      echo -ne "${BOLD}${VAR_NAME}${RESET} ${CYAN}(${DESCRIPTION})${RESET}: "
      read -r VALUE
      if [ -z "$VALUE" ]; then
        warn "Cannot be empty, try again."
      fi
    done
  fi
  echo "$VALUE"
}

echo -e "${YELLOW}Paste each value from your Render backend environment variables.${RESET}"
echo -e "${YELLOW}Press ENTER after each one. Leave optional fields blank by pressing ENTER.${RESET}"
echo ""

TMDB_API_KEY=$(prompt_secret "TMDB_API_KEY" "your TMDB API key" "")
AUTH0_DOMAIN=$(prompt_secret "AUTH0_DOMAIN" "e.g. your-tenant.auth0.com" "")
AUTH0_AUDIENCE=$(prompt_secret "AUTH0_AUDIENCE" "Auth0 API audience URL" "")
AUTH0_ISSUER_BASE_URL=$(prompt_secret "AUTH0_ISSUER_BASE_URL" "e.g. https://your-tenant.auth0.com/" "")
SUPABASE_URL=$(prompt_secret "SUPABASE_URL" "e.g. https://xxx.supabase.co" "")
SUPABASE_SERVICE_ROLE_KEY=$(prompt_secret "SUPABASE_SERVICE_ROLE_KEY" "Supabase service_role key" "")
ADMIN_SECRET=$(prompt_secret "ADMIN_SECRET" "your admin secret code" "")
ADMIN_JWT_SECRET=$(prompt_secret "ADMIN_JWT_SECRET" "your admin JWT secret" "")
DATABASE_URL=$(prompt_secret "DATABASE_URL" "PostgreSQL database connection string" "")
GEMINI_API_KEY=$(prompt_secret "GEMINI_API_KEY" "Gemini API key" "")
STRIPE_SECRET_KEY=$(prompt_secret "STRIPE_SECRET_KEY" "Stripe API secret key" "")
STRIPE_WEBHOOK_SECRET=$(prompt_secret "STRIPE_WEBHOOK_SECRET" "Stripe webhook secret" "")
UPI_ID=$(prompt_secret "UPI_ID" "UPI payment address" "")
UPI_PAYEE_NAME=$(prompt_secret "UPI_PAYEE_NAME" "UPI payee name" "")

echo ""
echo -ne "${BOLD}VITE_AUTH0_CLIENT_ID${RESET} ${CYAN}(optional, press ENTER to skip)${RESET}: "
read -r VITE_AUTH0_CLIENT_ID
echo -ne "${BOLD}VITE_AUTH0_AUDIENCE${RESET} ${CYAN}(optional, press ENTER to skip)${RESET}: "
read -r VITE_AUTH0_AUDIENCE
echo -ne "${BOLD}VITE_SUPABASE_ANON_KEY${RESET} ${CYAN}(optional, press ENTER to skip)${RESET}: "
read -r VITE_SUPABASE_ANON_KEY

# ════════════════════════════════════════════════════════════════════
# Build and apply the secret
# ════════════════════════════════════════════════════════════════════
step "Creating streamvault-secrets in the cluster"

for NS in streamvault streamvault-staging; do
  SECRET_NAME="streamvault-secrets"
  if [ "$NS" = "streamvault-staging" ]; then
    SECRET_NAME="staging-streamvault-secrets"
  fi

  # Build the kubectl command dynamically
  LOCAL_CMD=(kubectl create secret generic "$SECRET_NAME"
    --from-literal="TMDB_API_KEY=${TMDB_API_KEY}"
    --from-literal="VITE_TMDB_API_KEY=${TMDB_API_KEY}"
    --from-literal="AUTH0_DOMAIN=${AUTH0_DOMAIN}"
    --from-literal="AUTH0_AUDIENCE=${AUTH0_AUDIENCE}"
    --from-literal="AUTH0_ISSUER_BASE_URL=${AUTH0_ISSUER_BASE_URL}"
    --from-literal="SUPABASE_URL=${SUPABASE_URL}"
    --from-literal="SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
    --from-literal="ADMIN_SECRET=${ADMIN_SECRET}"
    --from-literal="ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}"
    --from-literal="DATABASE_URL=${DATABASE_URL}"
    --from-literal="GEMINI_API_KEY=${GEMINI_API_KEY}"
    --from-literal="STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}"
    --from-literal="STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
    --from-literal="UPI_ID=${UPI_ID}"
    --from-literal="UPI_PAYEE_NAME=${UPI_PAYEE_NAME}"
    -n "$NS"
    --dry-run=client -o yaml
  )

  # Add optional fields only if not empty
  [ -n "${VITE_AUTH0_CLIENT_ID:-}" ]  && LOCAL_CMD+=(--from-literal="VITE_AUTH0_CLIENT_ID=${VITE_AUTH0_CLIENT_ID}")
  [ -n "${VITE_AUTH0_AUDIENCE:-}" ]   && LOCAL_CMD+=(--from-literal="VITE_AUTH0_AUDIENCE=${VITE_AUTH0_AUDIENCE}")
  [ -n "${VITE_SUPABASE_ANON_KEY:-}" ] && LOCAL_CMD+=(--from-literal="VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}")

  "${LOCAL_CMD[@]}" | kubectl apply -f -
  ok "Secret '$SECRET_NAME' created in namespace '$NS'"
done

# ════════════════════════════════════════════════════════════════════
# STEP 10 — Apply ConfigMap + ArgoCD Applications
# ════════════════════════════════════════════════════════════════════
step "Applying ConfigMap"
kubectl apply -f "$PROJECT_DIR/k8s/base/configmap.yaml"
ok "ConfigMap applied"

step "Registering ArgoCD Applications (GitOps sync)"
kubectl apply -f "$PROJECT_DIR/k8s/argocd/application.yaml"
kubectl apply -f "$PROJECT_DIR/k8s/argocd/staging-application.yaml"
ok "ArgoCD Applications registered"

echo ""
echo "Waiting 10 seconds for ArgoCD to pick up the applications..."
sleep 10

# ── Show sync status ─────────────────────────────────────────────
step "ArgoCD Application Status"
kubectl get applications -n argocd 2>/dev/null || \
  warn "ArgoCD CLI not installed — check status via the UI"

# ── Get ArgoCD password ──────────────────────────────────────────
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "already-changed")

# ════════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  🎉  STREAMVAULT KUBERNETES SETUP COMPLETE!        ${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}What's running in your cluster:${RESET}"
kubectl get namespaces | grep -E "NAME|streamvault|argocd|argo-rollouts|monitoring|istio"
echo ""
echo -e "${BOLD}${CYAN}Open the ArgoCD dashboard to watch your app deploy:${RESET}"
echo -e "  Run: ${BOLD}kubectl port-forward svc/argocd-server -n argocd 8080:443${RESET}"
echo -e "  URL: ${CYAN}https://localhost:8080${RESET}"
echo -e "  User: ${BOLD}admin${RESET}"
echo -e "  Pass: ${BOLD}${GREEN}${ARGOCD_PASSWORD}${RESET}"
echo ""
echo -e "${BOLD}${CYAN}Watch a rollout live:${RESET}"
echo -e "  ${BOLD}kubectl argo rollouts get rollout streamvault-backend -n streamvault --watch${RESET}"
echo ""
echo -e "${BOLD}${YELLOW}Note:${RESET} ArgoCD needs to pull Docker images from ghcr.io."
echo -e "If images are private, run: ${BOLD}bash k8s/setup-image-pull-secret.sh${RESET}"
echo ""
