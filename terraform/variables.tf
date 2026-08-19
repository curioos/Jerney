variable "aws_region" {
  description = "AWS region to deploy the EKS cluster"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "jerney-eks"
}

variable "cluster_version" {
  description = "Kubernetes version for EKS"
  type        = string
  default     = "1.32"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "pg_backup_bucket_name" {
  description = "S3 bucket for PostgreSQL backups, created by terraform/bootstrap — referenced here read-only so this stack can never destroy it"
  type        = string
}

variable "pg_backup_service_account" {
  description = "Kubernetes ServiceAccount (namespace:name) the backup CronJob runs as, for the IRSA trust policy"
  type        = string
  default     = "jerney:jerney-db-backup"
}
