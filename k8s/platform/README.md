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
kubectl apply -f k8s/platform/argocd/jerney-project.yaml
kubectl apply -f k8s/platform/argocd/jerney-app.yaml
kubectl apply -f k8s/platform/kyverno/require-part-of-label.yaml
kubectl apply -f k8s/platform/kyverno/disallow-latest-tag.yaml
kubectl apply -f k8s/platform/monitoring/jerney-backend-servicemonitor.yaml
```

## 3) What each snippet does

- `argocd/jerney-project.yaml`: defines a project boundary in Argo CD for the Jerney app.
- `argocd/jerney-app.yaml`: tells Argo CD to continuously sync `k8s/Jerney/k8s` from Git into namespace `jerney`.
- `kyverno/require-part-of-label.yaml`: validates core Jerney resources include `app.kubernetes.io/part-of` label.
- `kyverno/disallow-latest-tag.yaml`: prevents `:latest` container tags (currently in `Audit` mode).
- `monitoring/jerney-backend-servicemonitor.yaml`: instructs Prometheus Operator to scrape backend metrics from service `jerney-backend`.

## 4) Apply the application with Kustomize (correct ordering)

`kubectl apply -f .` applies files alphabetically, so the namespace may not exist yet when other resources are created. Always use kustomize:

```bash
kubectl apply -k k8s/Jerney/k8s
```

Kustomize reads `kustomization.yaml` and applies resources in the declared order (`namespace.yaml` first), avoiding the "namespace not found" error.

> **Note:** `jerney.yaml` is a stray/corrupted file in that folder — delete it if present, it is not listed in `kustomization.yaml` and will cause validation errors when using `kubectl apply -f .`.

## 5) Retrieve the Argo CD initial admin password

After installing Argo CD, the initial password is stored in a secret:

```bash
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode; echo
```

Log in via the UI (or CLI) with username `admin` and the decoded password:

```bash
# Port-forward the server locally
kubectl port-forward svc/argocd-server -n argocd 9080:80 --address 0.0.0.0

# Then open http://localhost:9080 in your browser
# Or use the CLI:
argocd login localhost:9080 --username admin --password <decoded-password> --insecure
```

Once logged in, change the password immediately:

```bash
argocd account update-password
```

## 6) Create the database secret

The Jerney app expects a Kubernetes Secret named `jerney-db-secret` in the `jerney` namespace with keys `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.

### Option A — Manually (local/dev clusters)

```bash
kubectl create secret generic jerney-db-secret \
  --namespace jerney \
  --from-literal=POSTGRES_USER=jerney \
  --from-literal=POSTGRES_PASSWORD=<strong-password> \
  --from-literal=POSTGRES_DB=jerneydb
```

### Option B — External Secrets Operator + AWS Secrets Manager (production)

**Step 1:** Store the secret in AWS Secrets Manager under the key `jerney/prod/postgres` with the following JSON structure:

```json
{
  "username": "jerney",
  "password": "<strong-password>",
  "database": "jerneydb"
}
```

```bash
aws secretsmanager create-secret \
  --name jerney/prod/postgres \
  --region ap-south-1 \
  --secret-string '{"username":"jerney","password":"<strong-password>","database":"jerneydb"}'
```

**Step 2:** Install External Secrets Operator:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace \
  -f k8s/platform/external-secrets/external-secrets-values.yaml
```

> The values file configures the `external-secrets` service account with the IRSA role annotation (`eks.amazonaws.com/role-arn`) so the operator can authenticate to AWS without static credentials.

**Step 3:** Apply the ClusterSecretStore and ExternalSecret:

```bash
kubectl apply -f k8s/platform/external-secrets/aws-secretsmanager-store.yaml
kubectl apply -f k8s/platform/external-secrets/jerney-db-externalsecret.yaml
```

The operator will pull `jerney/prod/postgres` from Secrets Manager and create the `jerney-db-secret` Kubernetes Secret automatically. It refreshes every hour (`refreshInterval: 1h`).

**Verify the secret was created:**

```bash
kubectl get secret jerney-db-secret -n jerney
kubectl describe externalsecret jerney-db-secret -n jerney
```

## 7) Safe rollout recommendation

- Keep Kyverno policies in `Audit` first.
- Watch policy reports and fix violations.
- Then switch `validationFailureAction` from `Audit` to `Enforce`.
