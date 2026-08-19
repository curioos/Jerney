# ==============================================================
# Jerney EKS Cluster - Auto Mode
# ==============================================================

data "aws_availability_zones" "available" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

# ---- VPC ----
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = local.azs
  private_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets  = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 48)]

  enable_nat_gateway = true
  single_nat_gateway = true # Cost-saving for dev; use one per AZ for prod

  # Tags required for EKS Auto Mode to discover subnets
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# ---- EKS Cluster (Auto Mode) ----
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.31"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  # Auto Mode — EKS manages node groups, kube-proxy, CoreDNS, etc.
  cluster_compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  # Networking
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Security: enable private endpoint, public for initial kubectl access
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # Auth mode required for Auto Mode
  authentication_mode = "API"

  # Security: envelope encryption for secrets at rest
  cluster_encryption_config = {
    resources = ["secrets"]
  }

  # Security: enable logging
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  # Allow current caller (your IAM user/role) to manage the cluster
  enable_cluster_creator_admin_permissions = true
}

# ---- PostgreSQL Backup IRSA ----
# Read-only reference to the backup bucket — created and lifecycle-protected
# in terraform/bootstrap/, so this stack has no create/destroy power over it.
data "aws_s3_bucket" "pg_backups" {
  bucket = var.pg_backup_bucket_name
}

data "aws_iam_policy_document" "pg_backup" {
  statement {
    sid    = "ListBackupBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
    ]
    resources = [data.aws_s3_bucket.pg_backups.arn]
  }

  statement {
    sid    = "WriteBackupObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]
    resources = ["${data.aws_s3_bucket.pg_backups.arn}/postgres/*"]
  }
}

resource "aws_iam_policy" "pg_backup" {
  name        = "${var.cluster_name}-pg-backup"
  description = "Allows the Jerney Postgres backup CronJob to write pg_dump output to the backup bucket"
  policy      = data.aws_iam_policy_document.pg_backup.json
}

module "pg_backup_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-pg-backup"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = [var.pg_backup_service_account]
    }
  }

  role_policy_arns = {
    pg_backup = aws_iam_policy.pg_backup.arn
  }
}
