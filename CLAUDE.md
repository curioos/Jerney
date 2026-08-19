# Project: Jerney - GitOps DevSecOps Platform on AWS EKS

## What this is
A self-driven lab project demonstrating production-aligned DevSecOps patterns on AWS EKS. Three-tier app: Nginx frontend, Node.js backend, PostgreSQL database. This is NOT production - always maintain the lab vs production boundary clearly.

## Architecture
- **Infra provisioning:** Terraform (AWS VPC, EKS, IAM/IRSA)
- **CI:** GitHub Actions (lint, Checkov, Trivy, Docker build, push to GHCR, manifest update). CI never deploys - it only updates Git.
- **CD:** ArgoCD GitOps pull model from `devops` branch. Drift detection + reconciliation is the enforcement layer.
- **Security:** Kyverno admission controller (blocks :latest, denies privileged, enforces labels/namespaces), NetworkPolicy (backend-to-DB only), IRSA/OIDC for pod-level IAM
- **Secrets:** External Secrets Operator syncs from AWS Secrets Manager. ESO controller authenticates via IRSA, not application pods.
- **Database:** PostgreSQL StatefulSet + PVC backed by EBS CSI driver (gp3)
- **Observability:** kube-prometheus-stack (Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics), ServiceMonitor for backend /metrics, custom dashboards

## Conventions
- Kubernetes manifests: raw YAML, no Helm unless explicitly asked
- Terraform: modular, environment-driven, `variables.tf` for declarations, `terraform.tfvars` for assignment
- Ansible context: Tower in production, roles-based, Vault for secrets
- Assume EKS context for all AWS work, IRSA for pod IAM, Terraform for provisioning

## Response expectations
- Assume I know Linux internals, networking, container fundamentals. No basics unless asked.
- Keep answers direct. No filler. List trade-offs when they exist.
- Distinguish production-grade vs lab-only patterns. Interviewers test this boundary.
- Flag common interview question patterns when relevant.
- For troubleshooting: diagnostic steps first, then fix.
- When writing Terraform/YAML: production-quality, no placeholder values leaking secrets.

## Known gaps being addressed
- Multi-env promotion not implemented (design-level answer ready)
- IRSA role for External Secrets Operator not yet Terraform-managed (manual for now; the Postgres backup IRSA role now is — see below)

## Resolved
- Terraform remote backend (S3 + DynamoDB) — see `terraform/README.md`; bootstrap stack in `terraform/bootstrap/` provisions the bucket/table once per account
- Backend security hardening (JWT auth, Joi validation + XSS sanitization, Helmet, rate limiting, per-resource ownership checks) merged onto `devops` alongside the Prometheus instrumentation
- Kyverno policy enforcing resource requests/limits on every container/initContainer, including CronJobs (`k8s/platform/kyverno/require-resource-limits.yaml`)
- PostgreSQL backup/restore: daily `pg_dump` CronJob (`k8s/backup.yaml`) uploading to a Terraform-managed, `prevent_destroy`-protected S3 bucket via IRSA (`terraform/main.tf`'s `pg_backup_irsa` module); manual restore runbook in `k8s/platform/README.md` §8 (restore is deliberately not automated)
- SLO-based alerting: multi-window multi-burn-rate error-budget alerts for availability (99.5%) and latency (99% <500ms), replacing the old static-threshold rules — `k8s/platform/monitoring/jerney-slo.yaml`, methodology in `k8s/platform/README.md` §9
