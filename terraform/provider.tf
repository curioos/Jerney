terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — bucket/table are provisioned once via terraform/bootstrap/.
  # `bucket` and `region` are account-specific (S3 bucket names must be
  # globally unique) and are supplied at init time rather than hardcoded.
  # See terraform/backend.hcl.example.
  #
  #   terraform init -backend-config=backend.hcl
  backend "s3" {
    key            = "eks/terraform.tfstate"
    dynamodb_table = "jerney-tf-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Jerney"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
