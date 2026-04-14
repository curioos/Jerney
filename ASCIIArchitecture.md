                         +----------------------+
                         |      Developer       |
                         |  Pushes code to Git  |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |      GitHub Repo      |
                         |  devops branch = SoT  |
                         +----------+-----------+
                                    |
                                    v
                  +----------------------------------------+
                  |         GitHub Actions CI/CD           |
                  | lint | scan | build | push | update    |
                  | images to GHCR | update K8s manifests  |
                  +----------------+-----------------------+
                                   |
                                   v
                         +----------------------+
                         |         GHCR         |
                         | backend/frontend img |
                         +----------------------+

                                   GitOps pull
                                    by Argo CD
                                         |
                                         v
+----------------------------------------------------------------------------------+
|                                  Amazon EKS                                      |
|                                                                                  |
|  +-------------------+      +-------------------+      +----------------------+   |
|  |      Argo CD      | ---> |     Kyverno       | ---> |   Admission Policy   |   |
|  | syncs from Git    |      | policy engine     |      | enforce guardrails   |   |
|  +-------------------+      +-------------------+      +----------------------+   |
|                                                                                  |
|  +-------------------+      +-------------------+      +----------------------+   |
|  | Jerney Frontend   | ---> | Jerney Backend    | ---> | PostgreSQL Stateful  |   |
|  | Deployment        |      | Deployment        |      | Set + PVC            |   |
|  | UI / Nginx        |      | API + /metrics    |      | persistent storage   |   |
|  +-------------------+      +-------------------+      +----------------------+   |
|                                                                                  |
|  +-------------------+      +-------------------+                               |
|  | External Secrets  | ---> | AWS Secrets       |                               |
|  | Operator + IRSA   |      | Manager           |                               |
|  | syncs K8s Secret  |      | DB credentials    |                               |
|  +-------------------+      +-------------------+                               |
|                                                                                  |
|  +-------------------+      +-------------------+      +----------------------+   |
|  | Prometheus        | <--- | ServiceMonitor    | <--- | backend /metrics     |   |
|  | scrapes metrics   |      | + kube metrics    |      | + cluster metrics    |   |
|  +-------------------+      +-------------------+      +----------------------+   |
|            |                                                                    |
|            v                                                                    |
|  +-------------------+      +-------------------+                               |
|  | Grafana           |      | Alertmanager      |                               |
|  | dashboards        |      | alerts            |                               |
|  +-------------------+      +-------------------+                               |
+----------------------------------------------------------------------------------+