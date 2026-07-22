# StreamVault — Kubernetes Setup Guide

This directory (`infrastructure/k8s/`) contains the complete Kubernetes
configuration for StreamVault, organized as a **Kustomize** project with
**Argo Rollouts**, **Istio**, and **ArgoCD**. All commands below are meant to
be run from the repository root, so paths are given as `infrastructure/k8s/...`.

---

## Directory Structure

```
k8s/
├── base/                          # Shared manifests (all environments)
│   ├── namespace.yaml             # streamvault namespace
│   ├── serviceaccounts.yaml       # ServiceAccounts for frontend + backend
│   ├── configmap.yaml             # Non-secret env vars (REDIS_URL, NODE_ENV...)
│   ├── secret.yaml                # ⚠️ PLACEHOLDER — fill before deploying
│   ├── frontend-rollout.yaml      # Argo Rollout: canary deployment
│   ├── frontend-service.yaml      # Stable + canary services + Istio VirtualService
│   ├── backend-rollout.yaml       # Argo Rollout: canary deployment
│   ├── backend-service.yaml       # Stable + canary services + Istio VirtualService
│   ├── redis-deployment.yaml      # Redis stateful cache
│   ├── redis-service.yaml         # Redis ClusterIP service
│   ├── istio-gateway.yaml         # Istio Gateway (entry point for traffic)
│   ├── hpa.yaml                   # HorizontalPodAutoscaler (auto-scaling)
│   ├── network-policy.yaml        # Zero-trust pod networking rules
│   ├── pdb.yaml                   # PodDisruptionBudgets (HA during upgrades)
│   ├── media-scan-cronjob.yaml    # Weekly ClamAV scan of the media PVC (log-only)
│   └── analysis-templates/
│       ├── success-rate.yaml      # Prometheus gate: fail if success < 99.5%
│       └── p95-latency.yaml       # Prometheus gate: fail if P95 > 300ms
│
├── overlays/
│   ├── production/                # Production environment overrides
│   │   ├── kustomization.yaml
│   │   └── patches/
│   │       ├── replicas.yaml      # 5 replicas (HA)
│   │       └── configmap.yaml     # FRONTEND_URL → Vercel URL
│   └── staging/                   # Staging environment overrides
│       ├── kustomization.yaml
│       └── patches/
│           ├── replicas.yaml      # 1 replica (save cost)
│           └── configmap.yaml     # Staging-specific env vars
│
└── argocd/
    ├── application.yaml           # ArgoCD Application → production (auto-sync)
    └── staging-application.yaml   # ArgoCD Application → staging (manual sync)
```

---

## Prerequisites

Install these tools on your machine **before** running any commands:

| Tool | Purpose | Install |
|------|---------|---------|
| `kubectl` | Kubernetes CLI | https://kubernetes.io/docs/tasks/tools/ |
| `kustomize` | Overlay management | `brew install kustomize` or included in kubectl |
| `helm` | Install Istio, ArgoCD | https://helm.sh/docs/intro/install/ |
| `istioctl` | Install Istio | https://istio.io/latest/docs/setup/getting-started/ |

---

## Step 1 — Set Up Your Kubernetes Cluster

### Option A: Local development (Minikube)
```bash
minikube start --cpus=4 --memory=8192 --driver=docker
```

### Option B: Cloud (any managed Kubernetes)
- **Google GKE**: `gcloud container clusters create streamvault`
- **AWS EKS**: `eksctl create cluster --name streamvault`
- **DigitalOcean DOKS**: via the DigitalOcean dashboard

---

## Step 2 — Install Istio (Service Mesh)

Istio handles traffic routing for the canary deployments.

```bash
# Download istioctl
curl -L https://istio.io/downloadIstio | sh -

# Install Istio with the default profile
istioctl install --set profile=default -y

# Enable Istio sidecar injection on the streamvault namespace
kubectl label namespace streamvault istio-injection=enabled
```

---

## Step 3 — Install Argo Rollouts

Argo Rollouts provides the canary deployment strategy.

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Install the kubectl plugin (optional, for CLI management)
brew install argoproj/tap/kubectl-argo-rollouts
```

---

## Step 4 — Install ArgoCD

ArgoCD provides GitOps — it watches this repo and syncs the cluster.

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Port-forward the ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open: https://localhost:8080  (user: admin)
```

---

## Step 5 — Install Prometheus (for canary analysis gates)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

---

## Step 6 — Install Kubernetes Metrics Server (for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

---

## Step 7 — Create Real Secrets

> ⚠️ **NEVER** put real credentials in `k8s/base/secret.yaml`.
> The file is a template with placeholder values only.

Create the real secret using `kubectl`:

```bash
kubectl create secret generic streamvault-secrets \
  --from-literal=TMDB_API_KEY="your_tmdb_api_key" \
  --from-literal=AUTH0_DOMAIN="your-tenant.auth0.com" \
  --from-literal=AUTH0_AUDIENCE="your_auth0_audience" \
  --from-literal=AUTH0_ISSUER_BASE_URL="https://your-tenant.auth0.com/" \
  --from-literal=SUPABASE_URL="https://your-project.supabase.co" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
  --from-literal=ADMIN_SECRET="your_admin_secret" \
  --from-literal=ADMIN_JWT_SECRET="your_jwt_secret" \
  --from-literal=VITE_AUTH0_CLIENT_ID="your_client_id" \
  --from-literal=VITE_AUTH0_AUDIENCE="your_audience" \
  --from-literal=VITE_SUPABASE_ANON_KEY="your_anon_key" \
  -n streamvault \
  --dry-run=client -o yaml | kubectl apply -f -
```

Your actual secret values can be found in your **Render backend environment variables**.

---

## Step 8 — Apply the Namespace First

```bash
kubectl apply -f infrastructure/k8s/base/namespace.yaml
```

---

## Step 9 — Register ArgoCD Applications

```bash
# Apply both ArgoCD Applications (they will start syncing)
kubectl apply -f infrastructure/k8s/argocd/application.yaml         # Production
kubectl apply -f infrastructure/k8s/argocd/staging-application.yaml  # Staging
```

ArgoCD will now watch the `main` branch (production) and `develop` branch (staging)
and automatically sync the cluster when you push changes.

---

## Step 10 — Container Registry Setup (GitHub Container Registry)

Your images are built and pushed to **GitHub Container Registry (ghcr.io)** by the
CI/CD pipeline (`.github/workflows/`). The image names are:

```
ghcr.io/burhanrajkot/streamvault-frontend:<tag>
ghcr.io/burhanrajkot/streamvault-backend:<tag>
```

To make these images pullable by your cluster:

```bash
# Create a GHCR pull secret (use a GitHub Personal Access Token with read:packages scope)
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=burhanrajkot \
  --docker-password=<your_github_pat> \
  --docker-email=your@email.com \
  -n streamvault
```

Then add `imagePullSecrets` to the rollouts if your packages are private.

---

## Dry Run Validation

Before applying to a real cluster, validate manifests locally:

```bash
# Validate production overlay
kubectl kustomize infrastructure/k8s/overlays/production

# Validate staging overlay
kubectl kustomize infrastructure/k8s/overlays/staging

# Apply a dry run to a cluster
kubectl kustomize infrastructure/k8s/overlays/production | kubectl apply --dry-run=client -f -
```

This is also enforced automatically: the `k8s-validate` job in
`.github/workflows/ci.yml` runs both builds on every change under
`infrastructure/**`, so a broken overlay fails CI instead of shipping silently.

---

## How Canary Deployments Work

When the GitOps workflow pushes a new image tag, ArgoCD syncs and Argo Rollouts
runs the canary progression automatically:

```
5% traffic → wait 5m → Prometheus checks (success rate + P95 latency)
  ↓ pass
20% traffic → wait 5m → Prometheus checks
  ↓ pass
50% traffic → wait 10m → Prometheus checks
  ↓ pass
100% traffic (rollout complete)
  ↓ any check fails → automatic rollback to previous stable version
```

Monitor a rollout:
```bash
kubectl argo rollouts get rollout streamvault-backend -n streamvault --watch
```

Manually promote or abort:
```bash
kubectl argo rollouts promote streamvault-backend -n streamvault
kubectl argo rollouts abort streamvault-backend -n streamvault
```

---

## Media Library Malware Scan

`base/media-scan-cronjob.yaml` runs a weekly ClamAV scan (Wednesday 04:00 UTC)
against a `media` PVC, read-only. It's log-only for now — there's no live
cluster to wire alerting into yet, so findings are read from the Job's logs:

```bash
kubectl logs -n streamvault -l app.kubernetes.io/name=media-scan --tail=200
```

The `media` PVC (50Gi placeholder — resize once the real library size is
known) isn't yet mounted by `backend-rollout.yaml`; wire it in read-only
there once persistent media storage is actually in use.

You can run the same scan locally without a cluster at all:
```bash
docker compose -f infrastructure/docker/docker-compose.yml --profile scan run --rm clamav-scan
```

---

## Architecture Overview

```
Internet
   │
   ▼
Istio IngressGateway (streamvault-gateway)
   │
   ├──▶ VirtualService: streamvault-frontend-vsvc
   │        ├── 100% → streamvault-frontend-stable
   │        └──   0% → streamvault-frontend-canary  (increases during rollout)
   │
   └──▶ VirtualService: streamvault-backend-vsvc
            ├── 100% → streamvault-backend-stable
            └──   0% → streamvault-backend-canary

Backend Pods
   └──▶ redis:6379 (ClusterIP, only accessible from backend)
```
