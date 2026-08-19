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
kubectl apply -f k8s/platform/kyverno/block-privileged-pods.yaml
kubectl apply -f k8s/platform/kyverno/namespace-guardrails.yaml
kubectl apply -f k8s/platform/kyverno/require-resource-limits.yaml
kubectl apply -f k8s/platform/monitoring/jerney-backend-servicemonitor.yaml
kubectl apply -f k8s/platform/monitoring/jerney-alerts.yaml
kubectl apply -f k8s/platform/monitoring/jerney-slo.yaml
```

## 3) What each snippet does

- `argocd/jerney-project.yaml`: defines a project boundary in Argo CD for the Jerney app.
- `argocd/jerney-app.yaml`: tells Argo CD to continuously sync `k8s/Jerney/k8s` from Git into namespace `jerney`.
- `kyverno/require-part-of-label.yaml`: enforces `app.kubernetes.io/name`, `component`, and `part-of` labels on Deployments/Services/PVCs.
- `kyverno/disallow-latest-tag.yaml`: enforces that no container uses `:latest` or an untagged image.
- `kyverno/block-privileged-pods.yaml`: enforces no privileged containers, no host namespace sharing (hostNetwork/hostPID/hostIPC), no privilege escalation.
- `kyverno/namespace-guardrails.yaml`: enforces `automountServiceAccountToken: false` on Deployments and restricts Services to ClusterIP/NodePort.
- `kyverno/require-resource-limits.yaml`: enforces `resources.requests`/`resources.limits` (cpu + memory) on every container and initContainer.
- `monitoring/jerney-backend-servicemonitor.yaml`: instructs Prometheus Operator to scrape backend metrics from service `jerney-backend`.
- `monitoring/jerney-alerts.yaml`: black-box infra alerts (target down, pods not ready).
- `monitoring/jerney-slo.yaml`: SLO-based, multi-window multi-burn-rate alerts for availability and latency (see §9).

## 4) Apply the application with Kustomize (correct ordering)

`kubectl apply -f .` applies files alphabetically, so the namespace may not exist yet when other resources are created. Always use kustomize:

```bash
kubectl apply -k k8s/Jerney/k8s
```

Kustomize reads `kustomization.yaml` and applies resources in the declared order (`namespace.yaml` first), avoiding the "namespace not found" error.

> **Note:** an earlier stray/corrupted `jerney.yaml` file used to live in that folder; it has been removed. It was never listed in `kustomization.yaml`.

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

## 6) Create the application secrets

The backend needs two Kubernetes Secrets in the `jerney` namespace: `jerney-db-secret` (keys `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) and `jerney-backend-secret` (key `JWT_SECRET`, min 32 characters). The backend exits at startup via `validateEnv()` if either is missing.

### Option A — Manually (local/dev clusters)

```bash
kubectl create secret generic jerney-db-secret \
  --namespace jerney \
  --from-literal=POSTGRES_USER=jerney \
  --from-literal=POSTGRES_PASSWORD=<strong-password> \
  --from-literal=POSTGRES_DB=jerneydb

kubectl create secret generic jerney-backend-secret \
  --namespace jerney \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48)
```

### Option B — External Secrets Operator + AWS Secrets Manager (production)

**Step 1:** Store both secrets in AWS Secrets Manager:

```json
// jerney/dev/postgres
{
  "username": "jerney",
  "password": "<strong-password>",
  "database": "jerneydb"
}
```

```json
// jerney/dev/backend
{
  "jwt_secret": "<48+ random bytes, e.g. openssl rand -base64 48>"
}
```

```bash
aws secretsmanager create-secret \
  --name jerney/dev/postgres \
  --region ap-south-1 \
  --secret-string '{"username":"jerney","password":"<strong-password>","database":"jerneydb"}'

aws secretsmanager create-secret \
  --name jerney/dev/backend \
  --region ap-south-1 \
  --secret-string "{\"jwt_secret\":\"$(openssl rand -base64 48)\"}"
```

**Step 2:** Install External Secrets Operator:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace \
  -f k8s/platform/external-secrets/external-secrets-values.yaml
```

> The values file configures the `external-secrets` service account with the IRSA role annotation (`eks.amazonaws.com/role-arn`) so the operator can authenticate to AWS without static credentials. Replace `<AWS_ACCOUNT_ID>` in `external-secrets-values.yaml` and `argocd/external-secrets-controller-app.yaml` with your account ID before applying — this IRSA role is not yet provisioned by Terraform, so create it manually (or add it to `terraform/` as an `aws_iam_role` scoped to the `external-secrets` service account via the cluster's OIDC provider) before installing the operator.

**Step 3:** Apply the ClusterSecretStore and ExternalSecret:

```bash
kubectl apply -f k8s/platform/external-secrets/aws-secretsmanager-store.yaml
kubectl apply -f k8s/platform/external-secrets/jerney-db-externalsecret.yaml
kubectl apply -f k8s/platform/external-secrets/jerney-backend-externalsecret.yaml
```

The operator will pull `jerney/dev/postgres` and `jerney/dev/backend` from Secrets Manager and create the `jerney-db-secret` and `jerney-backend-secret` Kubernetes Secrets automatically. Both refresh every hour (`refreshInterval: 1h`).

**Verify the secret was created:**

```bash
kubectl get secret jerney-db-secret jerney-backend-secret -n jerney
kubectl describe externalsecret jerney-db-secret jerney-backend-secret -n jerney
```

## 7) Safe rollout recommendation

- Keep Kyverno policies in `Audit` first.
- Watch policy reports and fix violations.
- Then switch `validationFailureAction` from `Audit` to `Enforce`.

## 8) PostgreSQL backup & restore

`k8s/backup.yaml` runs a daily CronJob (`0 2 * * *` UTC) that `pg_dump`s the
database, gzips it, and uploads to the S3 bucket from `terraform/bootstrap/`
via the `jerney-eks-pg-backup` IRSA role. Before applying it: replace
`<AWS_ACCOUNT_ID>` in the ServiceAccount annotation and `BACKUP_BUCKET` in
the CronJob's env with your actual values (see `terraform/README.md`).

**Verify backups are running:**

```bash
kubectl get cronjob jerney-db-backup -n jerney
kubectl get jobs -n jerney -l app.kubernetes.io/component=backup
aws s3 ls s3://<pg_backup_bucket_name>/postgres/
```

**Restore is deliberately manual** — an automated restore path is one bad
trigger away from overwriting good data with a stale backup. Run a one-off
pod using the same backup ServiceAccount (so it inherits the same IRSA
permissions) to pull the dump, then pipe it into `psql` against the running
`jerney-db` service:

```bash
kubectl run pg-restore --rm -it --restart=Never \
  --namespace jerney \
  --overrides='{"spec":{"serviceAccountName":"jerney-db-backup"}}' \
  --image=postgres:16-alpine \
  --env="POSTGRES_USER=$(kubectl get secret jerney-db-secret -n jerney -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)" \
  --env="POSTGRES_PASSWORD=$(kubectl get secret jerney-db-secret -n jerney -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)" \
  --env="POSTGRES_DB=$(kubectl get secret jerney-db-secret -n jerney -o jsonpath='{.data.POSTGRES_DB}' | base64 -d)" \
  -- sh -c '
    apk add --no-cache aws-cli >/dev/null
    aws s3 cp "s3://<pg_backup_bucket_name>/postgres/<TIMESTAMP>.sql.gz" /tmp/restore.sql.gz
    gunzip -c /tmp/restore.sql.gz | PGPASSWORD="$POSTGRES_PASSWORD" psql -h jerney-db -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  '
```

Pick the object key from the `aws s3 ls` listing above. Restoring onto a
database with existing data will conflict on primary keys — for a full
restore, recreate the `jerney-db` PVC first (`kubectl delete pvc` + let the
StatefulSet re-provision it) so the target database starts empty.

## 9) SLO-based alerting

`monitoring/jerney-slo.yaml` replaces the old static-threshold alerts
(">5% errors for 10m", "p95 >1s for 10m" — noisy, no principled basis for
the thresholds) with error-budget burn-rate alerts, per
[Google's SRE workbook](https://sre.google/workbook/alerting-on-slos/).

Two SLOs, 30-day window:

| SLO | Target | Error budget |
|---|---|---|
| Availability | 99.5% non-5xx | 0.5% |
| Latency | 99% of requests < 500ms | 1% |

Each SLO gets two alerts, both requiring a short *and* long window to agree
(catches real degradation fast, ignores single-scrape blips):

- **Fast burn** (`severity: critical`) — burn rate ≥14.4x, i.e. the budget
  would be gone in <2 days if sustained. 2m `for:` delay.
- **Slow burn** (`severity: warning`) — burn rate ≥6x, budget gone in <5
  days. 15m `for:` delay.

`JerneyBackendTargetDown` and `JerneyPodsNotReady` in `jerney-alerts.yaml`
stay as-is — they're black-box infra checks, not SLIs, and don't fit the
burn-rate model.
