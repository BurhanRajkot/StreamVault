#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  StreamVault — Full Kubernetes Stack Installer
#  Run this from your terminal:  bash k8s/setup.sh
#  OS: EndeavourOS / Arch Linux
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✅ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${RESET}"; }
die()   { echo -e "${RED}❌ $*${RESET}"; exit 1; }
ask()   { echo -e "${YELLOW}${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ISTIO_VERSION="1.30.1"
ISTIO_DIR="$HOME/istio-${ISTIO_VERSION}"

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
  ____  _                            _   _   _
 / ___|| |_ _ __ ___  __ _ _ __ ___ | | | |_| |
 \___ \| __| '__/ _ \/ _` | '_ ` _ \| | | __| |
  ___) | |_| | |  __/ (_| | | | | | | |_| |_| |
 |____/ \__|_|  \___|\__,_|_| |_| |_|\___|\__|_|
   K8s Stack Installer — EndeavourOS / Arch Linux
EOF
echo -e "${RESET}"

echo -e "Project: ${BOLD}$PROJECT_DIR${RESET}"
echo -e "Kubernetes: ${BOLD}Minikube (local cluster)${RESET}"
echo ""
ask "This will install: kubectl, helm, minikube, istioctl, ArgoCD, Argo Rollouts, Prometheus"
ask "Press ENTER to continue, or Ctrl+C to cancel..."
read -r

# ════════════════════════════════════════════════════════════════════
# PHASE 1 — Install CLI Tools
# ════════════════════════════════════════════════════════════════════
step "PHASE 1 — Installing CLI tools (kubectl, helm, minikube)"

PKGS_TO_INSTALL=()
command -v kubectl  &>/dev/null || PKGS_TO_INSTALL+=(kubectl)
command -v helm     &>/dev/null || PKGS_TO_INSTALL+=(helm)
command -v minikube &>/dev/null || PKGS_TO_INSTALL+=(minikube)

if [ ${#PKGS_TO_INSTALL[@]} -gt 0 ]; then
  echo "Installing via pacman: ${PKGS_TO_INSTALL[*]}"
  sudo pacman -S --noconfirm "${PKGS_TO_INSTALL[@]}"
  ok "Installed: ${PKGS_TO_INSTALL[*]}"
else
  ok "kubectl, helm, minikube already installed — skipping"
fi

# ── istioctl ────────────────────────────────────────────────────
step "Installing istioctl"
if command -v istioctl &>/dev/null; then
  ok "istioctl already installed: $(istioctl version --remote=false 2>/dev/null | head -1)"
else
  # Check if already downloaded in project dir or home
  ISTIOCTL_BIN=""
  if [ -f "$PROJECT_DIR/istio-${ISTIO_VERSION}/bin/istioctl" ]; then
    ISTIOCTL_BIN="$PROJECT_DIR/istio-${ISTIO_VERSION}/bin/istioctl"
    # Move folder to home to keep project clean
    mv "$PROJECT_DIR/istio-${ISTIO_VERSION}" "$ISTIO_DIR" 2>/dev/null || true
    ISTIOCTL_BIN="$ISTIO_DIR/bin/istioctl"
  elif [ -f "$ISTIO_DIR/bin/istioctl" ]; then
    ISTIOCTL_BIN="$ISTIO_DIR/bin/istioctl"
  fi

  if [ -z "$ISTIOCTL_BIN" ]; then
    echo "Downloading istio ${ISTIO_VERSION}..."
    curl -L "https://github.com/istio/istio/releases/download/${ISTIO_VERSION}/istio-${ISTIO_VERSION}-linux-amd64.tar.gz" \
      -o /tmp/istio.tar.gz
    tar -xzf /tmp/istio.tar.gz -C "$HOME"
    mv "$HOME/istio-${ISTIO_VERSION}" "$ISTIO_DIR" 2>/dev/null || true
    rm /tmp/istio.tar.gz
    ISTIOCTL_BIN="$ISTIO_DIR/bin/istioctl"
  fi

  sudo install -m 755 "$ISTIOCTL_BIN" /usr/local/bin/istioctl
  ok "istioctl installed: $(istioctl version --remote=false 2>/dev/null | head -1)"
fi

# ── Verify all tools ─────────────────────────────────────────────
step "Verifying tool versions"
kubectl version --client --short 2>/dev/null || kubectl version --client
helm version --short 2>/dev/null || helm version
minikube version
istioctl version --remote=false 2>/dev/null | head -2
ok "All CLI tools ready"

# ════════════════════════════════════════════════════════════════════
# PHASE 2 — Docker + Minikube
# ════════════════════════════════════════════════════════════════════
step "PHASE 2 — Starting Docker daemon"
if systemctl is-active --quiet docker; then
  ok "Docker already running"
else
  sudo systemctl start docker
  sudo systemctl enable docker
  ok "Docker started"
fi

# Add user to docker group if not already
if ! groups "$USER" | grep -q docker; then
  warn "Adding $USER to docker group (you may need to log out and back in if minikube fails)"
  sudo usermod -aG docker "$USER"
fi

step "Starting Minikube (6 CPUs, 10 GB RAM)"
if minikube status 2>/dev/null | grep -q "Running"; then
  ok "Minikube already running"
else
  minikube start \
    --cpus=6 \
    --memory=10240 \
    --driver=docker \
    --kubernetes-version=stable \
    --addons=metrics-server \
    --addons=ingress
  ok "Minikube cluster started"
fi

echo ""
echo -e "${BOLD}Cluster nodes:${RESET}"
kubectl get nodes
echo ""

# ════════════════════════════════════════════════════════════════════
# PHASE 3 — Install Istio
# ════════════════════════════════════════════════════════════════════
step "PHASE 3 — Installing Istio onto the cluster"
if kubectl get namespace istio-system &>/dev/null; then
  ok "Istio already installed — skipping"
else
  istioctl install --set profile=default -y
  ok "Istio installed"
fi

# ════════════════════════════════════════════════════════════════════
# PHASE 4 — Argo Rollouts
# ════════════════════════════════════════════════════════════════════
step "PHASE 4 — Installing Argo Rollouts"
if kubectl get namespace argo-rollouts &>/dev/null; then
  ok "Argo Rollouts namespace already exists — skipping"
else
  kubectl create namespace argo-rollouts
  kubectl apply -n argo-rollouts \
    -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
  echo "Waiting for Argo Rollouts controller..."
  kubectl wait --for=condition=available deployment/argo-rollouts \
    -n argo-rollouts --timeout=180s
  ok "Argo Rollouts installed"
fi

# ── kubectl argo rollouts plugin ────────────────────────────────
if ! command -v kubectl-argo-rollouts &>/dev/null; then
  echo "Installing kubectl argo rollouts plugin..."
  curl -LO "https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64"
  sudo install -m 755 kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
  rm kubectl-argo-rollouts-linux-amd64
  ok "kubectl-argo-rollouts plugin installed"
fi

# ════════════════════════════════════════════════════════════════════
# PHASE 5 — ArgoCD
# ════════════════════════════════════════════════════════════════════
step "PHASE 5 — Installing ArgoCD"
if kubectl get deployment argocd-server -n argocd &>/dev/null; then
  ok "ArgoCD already installed — skipping"
else
  kubectl create namespace argocd 2>/dev/null || true
  kubectl apply -n argocd --server-side \
    -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
  echo "Waiting for ArgoCD server (this takes ~2 minutes)..."
  kubectl wait --for=condition=available deployment/argocd-server \
    -n argocd --timeout=300s
  ok "ArgoCD installed"
fi

# ── Get ArgoCD admin password ────────────────────────────────────
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "not-ready-yet")
echo ""
echo -e "${BOLD}ArgoCD Admin Password:${RESET} ${GREEN}${ARGOCD_PASSWORD}${RESET}"
echo -e "${BOLD}(Save this! You'll need it to log into the ArgoCD UI)${RESET}"
echo ""

# ════════════════════════════════════════════════════════════════════
# PHASE 6 — Prometheus + Metrics Server
# ════════════════════════════════════════════════════════════════════
step "PHASE 6 — Installing Prometheus (for canary analysis gates)"
if kubectl get namespace monitoring &>/dev/null; then
  ok "Prometheus already installed — skipping"
else
  helm repo add prometheus-community \
    https://prometheus-community.github.io/helm-charts 2>/dev/null || true
  helm repo update
  helm install prometheus prometheus-community/kube-prometheus-stack \
    --namespace monitoring \
    --create-namespace \
    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
    --wait --timeout=5m
  ok "Prometheus installed"
fi

step "Enabling Metrics Server (for HPA auto-scaling)"
if minikube addons list | grep -q "metrics-server.*enabled"; then
  ok "Metrics Server already enabled via Minikube addon"
else
  minikube addons enable metrics-server
  ok "Metrics Server enabled"
fi

# PHASE 7 — Create streamvault namespaces + label for Istio
# ════════════════════════════════════════════════════════════════════
step "PHASE 7 — Creating streamvault & streamvault-staging namespaces"
kubectl apply -f "$PROJECT_DIR/k8s/base/namespace.yaml"
kubectl create namespace streamvault-staging 2>/dev/null || true
kubectl label namespace streamvault istio-injection=enabled --overwrite
kubectl label namespace streamvault-staging istio-injection=enabled --overwrite
ok "Namespaces 'streamvault' and 'streamvault-staging' ready with Istio injection enabled"

# ════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✅  PHASES 1–7 COMPLETE!                  ${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}Cluster overview:${RESET}"
kubectl get nodes
echo ""
kubectl get namespaces | grep -E "NAME|streamvault|argocd|argo-rollouts|monitoring|istio"
echo ""
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${YELLOW}  NEXT: STEP 9 — Inject your secrets                 ${RESET}"
echo -e "${BOLD}${YELLOW}  Go back to the IDE and share your secret values.   ${RESET}"
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "ArgoCD UI:  ${CYAN}https://localhost:8080${RESET}"
echo -e "To open it: ${BOLD}kubectl port-forward svc/argocd-server -n argocd 8080:443${RESET}"
echo -e "Username:   ${BOLD}admin${RESET}"
echo -e "Password:   ${BOLD}${GREEN}${ARGOCD_PASSWORD}${RESET}"
echo ""
