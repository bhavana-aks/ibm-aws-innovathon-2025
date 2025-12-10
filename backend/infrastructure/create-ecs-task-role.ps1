# 07-12-25: Fixed for Windows PowerShell compatibility
# Phase 5: Video Recording - IAM Role for ECS Task

param(
    [string]$RoleName = "VideoSaaSECSTaskRole",
    [string]$ExecutionRoleName = "VideoSaaSECSExecutionRole",
    [string]$Region = "us-east-1"
)

Write-Host "=== Creating ECS Task IAM Roles ===" -ForegroundColor Cyan
Write-Host "Task Role: $RoleName"
Write-Host "Execution Role: $ExecutionRoleName"
Write-Host ""

# Get AWS Account ID
$accountId = (aws sts get-caller-identity --query Account --output text)
Write-Host "AWS Account ID: $accountId"
Write-Host ""

# Trust policy for ECS tasks
$trustPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Effect = "Allow"
            Principal = @{
                Service = "ecs-tasks.amazonaws.com"
            }
            Action = "sts:AssumeRole"
        }
    )
} | ConvertTo-Json -Depth 10 -Compress

# Write trust policy to temp file (UTF8 without BOM for AWS CLI)
$trustPolicyFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($trustPolicyFile, $trustPolicy)

# =====================
# ECS EXECUTION ROLE
# =====================
Write-Host "Creating ECS Execution Role..." -ForegroundColor Yellow

# Check if role exists
$existingExecRole = aws iam get-role --role-name $ExecutionRoleName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Execution role already exists." -ForegroundColor Yellow
} else {
    aws iam create-role `
        --role-name $ExecutionRoleName `
        --assume-role-policy-document "file://$trustPolicyFile" `
        --description "ECS execution role for Video SaaS video recording tasks" 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create execution role" -ForegroundColor Red
    } else {
        Write-Host "Execution role created." -ForegroundColor Green
    }
}

# Attach AWS managed policy for ECS execution
aws iam attach-role-policy `
    --role-name $ExecutionRoleName `
    --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" 2>$null

Write-Host "Execution role policy attached." -ForegroundColor Green

# =====================
# ECS TASK ROLE
# =====================
Write-Host ""
Write-Host "Creating ECS Task Role..." -ForegroundColor Yellow

# Check if role exists
$existingTaskRole = aws iam get-role --role-name $RoleName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Task role already exists. Updating policy..." -ForegroundColor Yellow
} else {
    aws iam create-role `
        --role-name $RoleName `
        --assume-role-policy-document "file://$trustPolicyFile" `
        --description "ECS task role for Video SaaS video recording" 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create task role" -ForegroundColor Red
    } else {
        Write-Host "Task role created." -ForegroundColor Green
    }
}

# Task policy - S3 access, Step Functions callback, CloudWatch logs
$taskPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Sid = "S3Access"
            Effect = "Allow"
            Action = @(
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket",
                "s3:DeleteObject"
            )
            Resource = @(
                "arn:aws:s3:::video-saas-*",
                "arn:aws:s3:::video-saas-*/*"
            )
        },
        @{
            Sid = "StepFunctionsCallback"
            Effect = "Allow"
            Action = @(
                "states:SendTaskSuccess",
                "states:SendTaskFailure",
                "states:SendTaskHeartbeat"
            )
            Resource = "*"
        },
        @{
            Sid = "CloudWatchLogs"
            Effect = "Allow"
            Action = @(
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogStreams"
            )
            Resource = "arn:aws:logs:*:*:log-group:/ecs/*"
        },
        @{
            Sid = "ECRAccess"
            Effect = "Allow"
            Action = @(
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage"
            )
            Resource = "*"
        }
    )
} | ConvertTo-Json -Depth 10 -Compress

# Write task policy to temp file (UTF8 without BOM for AWS CLI)
$taskPolicyFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($taskPolicyFile, $taskPolicy)

# Create or update the inline policy
aws iam put-role-policy `
    --role-name $RoleName `
    --policy-name "VideoRecorderTaskPolicy" `
    --policy-document "file://$taskPolicyFile" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Task role policy updated." -ForegroundColor Green
} else {
    Write-Host "Failed to update task role policy" -ForegroundColor Red
}

# Cleanup temp files
Remove-Item $trustPolicyFile -Force -ErrorAction SilentlyContinue
Remove-Item $taskPolicyFile -Force -ErrorAction SilentlyContinue

# Get role ARNs
$taskRoleArn = "arn:aws:iam::${accountId}:role/$RoleName"
$executionRoleArn = "arn:aws:iam::${accountId}:role/$ExecutionRoleName"

Write-Host ""
Write-Host "=== IAM Roles Created ===" -ForegroundColor Green
Write-Host "Task Role ARN: $taskRoleArn"
Write-Host "Execution Role ARN: $executionRoleArn"
Write-Host ""

Write-Host "=== ECS IAM Roles Setup Complete ===" -ForegroundColor Green
