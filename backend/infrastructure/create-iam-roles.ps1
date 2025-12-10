# 15-01-25: Created IAM roles and ABAC policies for Phase 2
# 16-01-25: Fixed encoding issues
# Creates IAM roles for Lambda functions and S3 bucket policies with ABAC

param(
    [string]$Region = "us-east-1",
    [string]$LambdaFunctionName = "list-files",
    [string]$S3BucketName = "",
    [string]$DynamoDBTableName = "VideoSaaS"
)

if ([string]::IsNullOrEmpty($S3BucketName)) {
    Write-Host "Error: S3BucketName is required" -ForegroundColor Red
    Write-Host "Usage: .\create-iam-roles.ps1 -S3BucketName <bucket-name>" -ForegroundColor Yellow
    exit 1
}

Write-Host "Creating IAM roles and ABAC policies" -ForegroundColor Green

$accountId = aws sts get-caller-identity --query Account --output text

# Step 1: Create IAM role for Lambda function
Write-Host "`nStep 1: Creating Lambda execution role..." -ForegroundColor Yellow

$roleName = "video-saas-lambda-role"
$assumeRolePolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Effect = "Allow"
            Principal = @{
                Service = "lambda.amazonaws.com"
            }
            Action = "sts:AssumeRole"
        }
    )
} | ConvertTo-Json -Compress

# Check if role exists
$existingRole = aws iam get-role --role-name $roleName 2>&1
if ($LASTEXITCODE -ne 0) {
    aws iam create-role `
        --role-name $roleName `
        --assume-role-policy-document $assumeRolePolicy `
        --description "Execution role for Video SaaS Lambda functions" `
        --output json | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Lambda role created: $roleName" -ForegroundColor Green
    } else {
        Write-Host "Error creating Lambda role" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] Lambda role already exists: $roleName" -ForegroundColor Yellow
}

# Step 2: Attach policies to Lambda role
Write-Host "`nStep 2: Attaching policies to Lambda role..." -ForegroundColor Yellow

# Basic Lambda execution policy
aws iam attach-role-policy `
    --role-name $roleName `
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" `
    --output json | Out-Null

# DynamoDB read policy
$dynamoPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Effect = "Allow"
            Action = @(
                "dynamodb:Query",
                "dynamodb:GetItem"
            )
            Resource = "arn:aws:dynamodb:$Region`:$accountId`:table/$DynamoDBTableName"
        }
    )
} | ConvertTo-Json -Compress

$dynamoPolicyName = "video-saas-dynamodb-policy"
aws iam put-role-policy `
    --role-name $roleName `
    --policy-name $dynamoPolicyName `
    --policy-document $dynamoPolicy `
    --output json | Out-Null

Write-Host "[OK] Policies attached to Lambda role" -ForegroundColor Green

# Step 3: Update S3 bucket policy with ABAC
Write-Host "`nStep 3: Updating S3 bucket policy with ABAC..." -ForegroundColor Yellow

$bucketPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Sid = "AllowTenantAccess"
            Effect = "Allow"
            Principal = "*"
            Action = @(
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            )
            Resource = "arn:aws:s3:::$S3BucketName/*"
            Condition = @{
                StringEquals = @{
                    "aws:PrincipalTag/tenant_id" = "`${aws:PrincipalTag/tenant_id}"
                }
            }
        },
        @{
            Sid = "AllowListBucket"
            Effect = "Allow"
            Principal = "*"
            Action = "s3:ListBucket"
            Resource = "arn:aws:s3:::$S3BucketName"
            Condition = @{
                StringEquals = @{
                    "aws:PrincipalTag/tenant_id" = "`${aws:PrincipalTag/tenant_id}"
                }
            }
        }
    )
} | ConvertTo-Json -Depth 10

aws s3api put-bucket-policy `
    --bucket $S3BucketName `
    --policy $bucketPolicy `
    --region $Region

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] S3 bucket policy updated with ABAC" -ForegroundColor Green
} else {
    Write-Host "Warning: Failed to update S3 bucket policy. You may need to update it manually." -ForegroundColor Yellow
}

# Step 4: Tag Cognito users (this is a manual step, but we'll provide instructions)
Write-Host "`nStep 4: Tagging instructions for Cognito users..." -ForegroundColor Yellow

Write-Host "`n=== Manual Steps Required ===" -ForegroundColor Cyan
Write-Host "To enable ABAC, you need to tag Cognito users with tenant_id:" -ForegroundColor Yellow
Write-Host "1. Get the IAM role ARN for authenticated users (from Cognito Identity Pool)" -ForegroundColor White
Write-Host "2. Tag the role with tenant_id using:" -ForegroundColor White
Write-Host "   aws iam tag-role --role-name <role-name> --tags Key=tenant_id,Value=TENANT#101" -ForegroundColor White
Write-Host "`nNote: For MVP, you can use a simpler approach with direct tenant_id in IAM conditions" -ForegroundColor Yellow

# Step 5: Output configuration
Write-Host "`n=== Configuration ===" -ForegroundColor Cyan
Write-Host "Lambda Role: $roleName" -ForegroundColor White
Write-Host "Role ARN: arn:aws:iam::$accountId`:role/$roleName" -ForegroundColor White
Write-Host "S3 Bucket: $S3BucketName" -ForegroundColor White

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Update Lambda function to use the role:" -ForegroundColor Yellow
Write-Host "   aws lambda update-function-configuration --function-name $LambdaFunctionName --role arn:aws:iam::$accountId`:role/$roleName --region $Region" -ForegroundColor White

Write-Host "`n[OK] IAM roles and policies setup complete!" -ForegroundColor Green
