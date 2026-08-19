# ==============================================================
# Jerney Terraform Bootstrap
# ==============================================================
# One-time, manually-applied stack that creates the S3 bucket and
# DynamoDB table the main terraform/ config uses for remote state.
#
# This stack's own state stays LOCAL (not remote) — a remote backend
# can't depend on infrastructure that doesn't exist yet. Run this
# once per AWS account/environment, then never touch it again.
#
#   cd terraform/bootstrap
#   terraform init
#   terraform apply
# ==============================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Jerney"
      Environment = var.environment
      ManagedBy   = "Terraform-Bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "bootstrap_kms" {
  #checkov:skip=CKV_AWS_109:KMS key policy — `resources = ["*"]` means "this key itself" (self-referential), the standard AWS pattern for resource-based key policies. There is no other resource to scope to.
  #checkov:skip=CKV_AWS_356:same as above
  #checkov:skip=CKV_AWS_111:same as above
  statement {
    sid    = "EnableRootAccountAccess"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }
}

resource "aws_kms_key" "bootstrap" {
  description         = "CMK for Jerney Terraform state, backups, and lock table encryption"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.bootstrap_kms.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "bootstrap" {
  name          = "alias/jerney-bootstrap"
  target_key_id = aws_kms_key.bootstrap.key_id
}

resource "aws_s3_bucket" "tf_state" {
  bucket = var.state_bucket_name

  # Protects the state bucket from accidental `terraform destroy`
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.bootstrap.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    id     = "state-hygiene"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Old state versions (rollback history) don't need to live forever.
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket" "pg_backups" {
  bucket = var.pg_backup_bucket_name

  # Backups must outlive `terraform destroy` on the main EKS stack — this
  # bucket lives in a separate state on purpose, plus its own protection.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "pg_backups" {
  bucket = aws_s3_bucket.pg_backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pg_backups" {
  bucket = aws_s3_bucket.pg_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.bootstrap.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "pg_backups" {
  bucket = aws_s3_bucket.pg_backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "pg_backups" {
  bucket = aws_s3_bucket.pg_backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    expiration {
      days = var.pg_backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.pg_backup_retention_days
    }
  }
}

resource "aws_dynamodb_table" "tf_lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.bootstrap.arn
  }

  lifecycle {
    prevent_destroy = true
  }
}
