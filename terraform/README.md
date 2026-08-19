# Terraform — Jerney EKS

Two stacks, applied in order:

## 1. Bootstrap (one time per AWS account)

Creates the S3 bucket + DynamoDB table the main stack's remote state depends
on, plus the S3 bucket for PostgreSQL backups. Stays on local state
deliberately — a remote backend can't depend on infrastructure that doesn't
exist yet, and the backup bucket must outlive `terraform destroy` on the main
stack, which it can't do if it's *in* the main stack's state.

```bash
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # set globally-unique state_bucket_name + pg_backup_bucket_name
terraform init
terraform apply
```

## 2. Main stack (VPC + EKS)

```bash
cd terraform
cp backend.hcl.example backend.hcl             # set bucket/region from step 1's output
terraform init -backend-config=backend.hcl

cat > local.auto.tfvars <<EOF
pg_backup_bucket_name = "<pg_backup_bucket_name output from step 1>"
EOF

terraform plan
terraform apply
```

```bash
aws eks update-kubeconfig --region <region> --name <cluster_name>
```

`terraform apply` prints `pg_backup_irsa_role_arn` — paste it into the
`eks.amazonaws.com/role-arn` annotation on the ServiceAccount in
`k8s/backup.yaml` (replacing the `<AWS_ACCOUNT_ID>` placeholder there, same
pattern as the External Secrets IRSA role).

`backend.hcl`, `terraform/local.auto.tfvars`, and
`terraform/bootstrap/terraform.tfvars` are gitignored (account-specific
bucket names). `terraform/terraform.tfvars` (region, cluster name, CIDR — no
secrets) stays tracked.
