# 🛤️ Jerney — Blog Platform (DevSecOps branch)

A Gen-Z vibe blog platform — React frontend, Node.js backend, PostgreSQL database — built out as a lab demonstrating production-aligned DevSecOps patterns on AWS EKS. **This is a lab, not production**; see [Lab vs. production](#-lab-vs-production) below for where the line is drawn.

![Tech Stack](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tech Stack](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js)
![Tech Stack](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)
![Tech Stack](https://img.shields.io/badge/Terraform-EKS-844FBA?style=flat-square&logo=terraform)
![Tech Stack](https://img.shields.io/badge/Argo_CD-GitOps-EF7B4D?style=flat-square&logo=argo)
![Tech Stack](https://img.shields.io/badge/Kyverno-Policy-3060A0?style=flat-square)

---

> [!NOTE]
> **Just want the app source without the platform?** Switch to [`main`](../../tree/main) — source code plus a bare-metal EC2 deploy script, no Docker/Kubernetes/Terraform required.

---

## ✨ Features

- 📝 Create blog posts with emoji vibes
- ✏️ Edit your existing posts
- 🗑️ Delete posts you're not feeling anymore
- 💬 Comment on posts
- 🎨 Gen-Z dark UI with glassmorphism and gradients
- 🔐 JWT-authenticated writes, public reads, per-resource ownership checks

## 🏗️ Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL   │
│   (React +   │◀────│  (Node.js +  │◀────│  StatefulSet  │
│    Nginx)    │     │   Express)   │     │     + PVC     │
│   Port 80    │     │  Port 5000   │     │  Port 5432   │
└──────────────┘     └──────────────┘     └──────────────┘
```

That's the logical 3-tier view. The full platform — CI/CD, GitOps sync, admission policy, secrets, monitoring — is diagrammed in [`ASCIIArchitecture.md`](ASCIIArchitecture.md). Short version: GitHub Actions lints/scans/builds and pushes images to GHCR, then updates the K8s manifests in Git — **CI never deploys**. ArgoCD pulls from Git and reconciles the cluster; drift detection is the actual enforcement layer.

## 📁 Project Structure

```
Jerney/
├── frontend/                  # React (Vite) frontend
├── backend/                   # Node.js Express API (JWT auth, Joi validation, rate limiting)
├── terraform/                 # VPC + EKS (Auto Mode), remote state bootstrap, backup IRSA
│   ├── bootstrap/             # One-time: S3 state bucket, DynamoDB lock table, backup bucket
│   └── README.md              # Terraform setup walkthrough
├── k8s/                       # Raw manifests (namespace, backend, frontend, db, backup, netpol)
│   └── platform/              # ArgoCD apps, Kyverno policies, External Secrets, monitoring/SLOs
│       └── README.md          # Platform install walkthrough + backup/restore + SLO methodology
├── deploy/                    # EC2 bare-metal fallback (setup.sh, nginx reverse proxy)
├── docker-compose.yml         # Local 3-tier stack without Kubernetes
├── .github/workflows/         # CI/CD pipeline
├── .checkov.yml               # IaC scan config (single source of truth for skip-checks)
└── ASCIIArchitecture.md       # Full platform diagram
```

---

## 🚀 Running it

Pick the path that matches what you're doing:

### Option A — Docker Compose (fastest, no Kubernetes)

```bash
docker compose up --build
```

Frontend on `http://localhost`, Postgres on `:5432`. Backend is internal-only on the compose network (not published to the host) — the frontend's Nginx proxies `/api` to it.

### Option B — Local dev, no Docker

**Backend**

```bash
cd backend
npm install
cp .env.example .env   # fill in DB_*, JWT_SECRET (32+ chars), FRONTEND_URL
npm start
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Vite dev server on `http://localhost:3000`, proxies `/api` to `http://localhost:5000`.

### Option C — Full EKS GitOps platform

Terraform (VPC/EKS/backup IRSA) → ArgoCD/Kyverno/External Secrets/monitoring → app manifests, in that order:

```bash
# 1. Provision AWS infra — see terraform/README.md for the full bootstrap → apply flow
cd terraform/bootstrap && terraform init && terraform apply
cd ../ && terraform init -backend-config=backend.hcl && terraform apply

# 2. Install the platform layer and app — see k8s/platform/README.md
```

`k8s/platform/README.md` covers ArgoCD/Kyverno/External Secrets Operator install, secret provisioning, PostgreSQL backup/restore, and the SLO-based alerting methodology in full — not duplicated here.

### Option D — EC2 bare-metal (legacy fallback)

```bash
scp -r -i your-key.pem ./Jerney ubuntu@<EC2_PUBLIC_IP>:~/Jerney
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/Jerney && chmod +x deploy/setup.sh && ./deploy/setup.sh
```

Installs Node.js 20, PostgreSQL 16, Nginx, PM2; configures Nginx as a reverse proxy. `pm2 status` / `pm2 logs` / `sudo systemctl restart nginx` for day-2 ops.

---

## 🔒 Security & platform highlights

- **App:** JWT auth on writes (`POST`/`PUT`/`DELETE`), Joi validation + XSS sanitization, Helmet, rate limiting, per-resource ownership checks (backend/src/middleware, backend/src/routes)
- **Admission control:** Kyverno enforces no `:latest` tags, no privileged containers, required labels, `automountServiceAccountToken: false`, and resource requests/limits on every container (`k8s/platform/kyverno/`)
- **Secrets:** External Secrets Operator syncs from AWS Secrets Manager via IRSA — application pods never hold AWS credentials directly (`k8s/platform/external-secrets/`)
- **Network:** NetworkPolicy restricts backend↔DB traffic to backend pods only (`k8s/networkpolicies.yaml`)
- **Backup:** daily `pg_dump` CronJob to a Terraform-managed, `prevent_destroy`-protected S3 bucket via IRSA; restore is a documented manual runbook, not automated (`k8s/platform/README.md` §8)
- **Observability:** kube-prometheus-stack + SLO-based multi-window, multi-burn-rate alerting for availability and latency, not static thresholds (`k8s/platform/monitoring/`, methodology in `k8s/platform/README.md` §9)
- **CI/CD:** GitHub Actions — lint gates dependency audit → build+push (GHCR, with SBOM/provenance) → Trivy image scan, while Checkov (IaC) and Hadolint (Dockerfiles) run in parallel off lint; manifest update only fires once everything passes, and only on push to `devops`. All scan stages hard-fail the pipeline.

## 🧪 Lab vs. production

Explicitly *not* production-hardened, by design, to keep this a runnable lab:

- Public EKS API endpoint (kubectl convenience) — `CKV_AWS_39`/`58` skipped intentionally
- Single NAT gateway (cost, not HA)
- No S3 access logging / cross-region replication on the Terraform-managed buckets — no log-destination bucket or second region in this lab
- IRSA role for External Secrets Operator is manually created, not Terraform-managed (the backup CronJob's IRSA role *is* Terraform-managed — see `terraform/main.tf`)
- No multi-environment promotion pipeline (design-level answer, not implemented)

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Health check |
| GET | `/metrics` | — | Prometheus metrics |
| POST | `/api/auth/login` | — | Get a JWT (lab-only single admin user) |
| POST | `/api/auth/refresh` | — | Refresh a JWT |
| GET | `/api/posts` | — | Get all posts |
| GET | `/api/posts/:id` | — | Get single post with comments |
| POST | `/api/posts` | 🔒 | Create a post |
| PUT | `/api/posts/:id` | 🔒 owner | Update a post |
| DELETE | `/api/posts/:id` | 🔒 owner | Delete a post |
| GET | `/api/comments/post/:postId` | — | Get comments for a post |
| POST | `/api/comments` | 🔒 | Create a comment |
| DELETE | `/api/comments/:id` | 🔒 owner | Delete a comment |

🔒 = requires `Authorization: Bearer <token>`; "owner" = only the creator can modify/delete.

---

## 🌿 Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Source code + EC2 bare-metal deployment only |
| `devops` | This branch — Docker, Kubernetes (EKS Auto Mode), Terraform, ArgoCD GitOps, Kyverno, CI/CD, security scanning |

---

Built with 💜 by the Jerney team. No cap, this blog platform hits different. 🛤️
