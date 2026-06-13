#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  StreamVault — GitHub Container Registry Pull Secret
#  Run if your Docker images on ghcr.io are private.
#  Usage: bash k8s/setup-image-pull-secret.sh
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; RESET='\033[0m'

echo -e "${BOLD}${CYAN}GitHub Container Registry Pull Secret Setup${RESET}"
echo ""
echo -e "You need a GitHub Personal Access Token with ${BOLD}read:packages${RESET} scope."
echo -e "Create one at: ${CYAN}https://github.com/settings/tokens${RESET}"
echo ""

echo -ne "${BOLD}GitHub username${RESET} [burhanrajkot]: "
read -r GH_USERNAME
GH_USERNAME="${GH_USERNAME:-burhanrajkot}"

echo -ne "${BOLD}GitHub email${RESET}: "
read -r GH_EMAIL

echo -ne "${BOLD}GitHub Personal Access Token${RESET} (read:packages scope): "
read -rs GH_TOKEN
echo ""

for NS in streamvault streamvault-staging; do
  if kubectl get namespace "$NS" &>/dev/null; then
    kubectl create secret docker-registry ghcr-pull-secret \
      --docker-server=ghcr.io \
      --docker-username="$GH_USERNAME" \
      --docker-password="$GH_TOKEN" \
      --docker-email="$GH_EMAIL" \
      -n "$NS" \
      --dry-run=client -o yaml | kubectl apply -f -
    echo -e "${GREEN}✅ Pull secret created in namespace: $NS${RESET}"
  fi
done

echo ""
echo -e "${GREEN}✅ Done! Your cluster can now pull images from ghcr.io/${GH_USERNAME}${RESET}"
