# Kyverno + Argo CD + Prometheus/Grafana (Jerney)

This folder gives you a single, practical starter path for policy, GitOps, and monitoring.

## 1) Install controllers once per cluster

```bash
# Kyverno
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
helm upgrade --install kyverno kyverno/kyverno -n kyverno --create-namespace

# Argo CD
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Prometheus + Grafana (kube-prometheus-stack)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

## 2) Apply manifests in this folder

```bash
kubectl apply -f k8s/Jerney/k8s/platform/argocd/jerney-project.yaml
kubectl apply -f k8s/Jerney/k8s/platform/argocd/jerney-app.yaml
kubectl apply -f k8s/Jerney/k8s/platform/kyverno/require-part-of-label.yaml
kubectl apply -f k8s/Jerney/k8s/platform/kyverno/disallow-latest-tag.yaml
kubectl apply -f k8s/Jerney/k8s/platform/monitoring/jerney-backend-servicemonitor.yaml
```

## 3) What each snippet does

- `argocd/jerney-project.yaml`: defines a project boundary in Argo CD for the Jerney app.
- `argocd/jerney-app.yaml`: tells Argo CD to continuously sync `k8s/Jerney/k8s` from Git into namespace `jerney`.
- `kyverno/require-part-of-label.yaml`: validates core Jerney resources include `app.kubernetes.io/part-of` label.
- `kyverno/disallow-latest-tag.yaml`: prevents `:latest` container tags (currently in `Audit` mode).
- `monitoring/jerney-backend-servicemonitor.yaml`: instructs Prometheus Operator to scrape backend metrics from service `jerney-backend`.

## 4) Safe rollout recommendation

- Keep Kyverno policies in `Audit` first.
- Watch policy reports and fix violations.
- Then switch `validationFailureAction` from `Audit` to `Enforce`.
