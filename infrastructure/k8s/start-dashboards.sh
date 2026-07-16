#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  StreamVault — Cluster Environment Dashboard & Tunnel Starter
#  Usage: bash k8s/start-dashboards.sh
# ════════════════════════════════════════════════════════════════════
# bash k8s/start-dashboards.sh 
set -eo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RED='\033[0;31m'; RESET='\033[0m'

# Track background jobs
pids=()

cleanup() {
  echo -e "\n${YELLOW}Stopping background tunnels and port-forwards...${RESET}"
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  echo -e "${GREEN}Done! Goodbye!${RESET}"
}

# Trap exit/Ctrl+C
trap cleanup EXIT

echo -e "${BOLD}${CYAN}StreamVault local dev cluster helper${RESET}"
echo ""

# 1. Check if Minikube is running
if ! minikube status 2>/dev/null | grep -q "Running"; then
  echo -e "${YELLOW}Minikube is not running. Starting minikube...${RESET}"
  minikube start --cpus=4 --memory=8192 --driver=docker
fi

# 2. Start minikube tunnel in background
echo -e "${CYAN}Starting minikube tunnel (may prompt for sudo)...${RESET}"
sudo -v # pre-authenticate sudo
sudo minikube tunnel &
pids+=($!)

# 3. Wait for ingress gateway to get external IP
echo -n "Waiting for Ingress Gateway External IP..."
gateway_ip=""
for i in {1..30}; do
  gateway_ip=$(kubectl get svc istio-ingressgateway -n istio-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [ -z "$gateway_ip" ]; then
    gateway_ip=$(kubectl get svc istio-ingressgateway -n istio-system -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
  fi
  if [ -n "$gateway_ip" ]; then
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

if [ -z "$gateway_ip" ]; then
  echo -e "${RED}Failed to resolve Ingress Gateway IP. Make sure 'minikube tunnel' starts correctly.${RESET}"
  exit 1
fi

echo -e "${GREEN}✅ Resolved Ingress Gateway IP: $gateway_ip${RESET}"

# 4. Check and update /etc/hosts
if grep -q "streamvault.example.com" /etc/hosts; then
  echo -e "${GREEN}✅ /etc/hosts already contains streamvault.example.com${RESET}"
else
  echo -e "${YELLOW}Adding host entries to /etc/hosts (requires sudo)...${RESET}"
  sudo sh -c "echo '$gateway_ip streamvault.example.com api.streamvault.example.com' >> /etc/hosts"
  echo -e "${GREEN}✅ /etc/hosts updated!${RESET}"
fi

# 5. Get ArgoCD Admin Password
echo -n "Fetching ArgoCD admin password..."
ARGOCD_PASSWORD=""
for i in {1..10}; do
  ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "")
  if [ -n "$ARGOCD_PASSWORD" ]; then
    break
  fi
  sleep 1
done

if [ -z "$ARGOCD_PASSWORD" ]; then
  echo -e "${YELLOW} (Password secret not found, maybe already deleted. Skip password retrieval)${RESET}"
else
  echo -e "${GREEN} Done!${RESET}"
fi

# 6. Start port-forwards
echo -e "${CYAN}Starting port-forwards...${RESET}"

# ArgoCD port-forward
kubectl port-forward svc/argocd-server -n argocd 8080:443 &>/dev/null &
pids+=($!)

# Argo Rollouts dashboard
kubectl argo rollouts dashboard -n streamvault --port 3100 &>/dev/null &
pids+=($!)

sleep 2

# 7. Print access instructions
echo ""
echo -e "${GREEN}🚀 ENVIRONMENT IS READY AND RUNNING!${RESET}"
echo -e "Press ${BOLD}Ctrl+C${RESET} in this terminal to stop the tunnel and port-forwards."
echo ""
echo -e "${BOLD}App URLs:${RESET}"
echo -e "  - Frontend:       ${CYAN}http://streamvault.example.com${RESET}"
echo -e "  - Backend API:    ${CYAN}http://api.streamvault.example.com${RESET}"
echo ""
echo -e "${BOLD}Dashboards:${RESET}"
echo -e "  - ArgoCD:         ${CYAN}https://localhost:8080${RESET}"
if [ -n "$ARGOCD_PASSWORD" ]; then
  echo -e "                    Username: ${BOLD}admin${RESET}"
  echo -e "                    Password: ${BOLD}${GREEN}${ARGOCD_PASSWORD}${RESET}"
fi
echo -e "  - Argo Rollouts:  ${CYAN}http://localhost:3100${RESET}"
echo ""

# Keep running
while true; do
  sleep 1
done
