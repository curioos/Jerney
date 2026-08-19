output "state_bucket_name" {
  description = "S3 bucket name to use in terraform/backend.hcl"
  value       = aws_s3_bucket.tf_state.id
}

output "lock_table_name" {
  description = "DynamoDB table name to use in terraform/backend.hcl"
  value       = aws_dynamodb_table.tf_lock.id
}

output "region" {
  description = "Region to use in terraform/backend.hcl"
  value       = var.aws_region
}

output "pg_backup_bucket_name" {
  description = "S3 bucket name to use as pg_backup_bucket_name in the main terraform/ stack"
  value       = aws_s3_bucket.pg_backups.id
}
