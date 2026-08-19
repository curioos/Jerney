variable "aws_region" {
  description = "AWS region for the state bucket and lock table"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform remote state (e.g. jerney-tf-state-<your-account-id>)"
  type        = string
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking"
  type        = string
  default     = "jerney-tf-lock"
}

variable "pg_backup_bucket_name" {
  description = "Globally-unique S3 bucket name for PostgreSQL backups (e.g. jerney-pg-backups-<your-account-id>)"
  type        = string
}

variable "pg_backup_retention_days" {
  description = "Days to retain PostgreSQL backups before S3 lifecycle expiry"
  type        = number
  default     = 30
}
