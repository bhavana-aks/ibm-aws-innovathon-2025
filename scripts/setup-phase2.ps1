# 15-01-25: Created Phase 2 setup script
# 16-01-25: Fixed path construction, encoding issues, and error handling
# Sets up Cognito, API Gateway, Lambda, and IAM roles for Phase 2

param(
    [string]$Region = "us-east-1",
    [string]$S3BucketName = ""
)

Write-Host "=== Phase 2: Authentication & Multi-Tenancy Setup ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($S3BucketName)) {
    Write-Host "Error: S3BucketName is required" -ForegroundColor Red
    Write-Host "Usage: .\scripts\setup-phase2.ps1 -S3BucketName <bucket-name>" -ForegroundColor Yellow
    Write-Host "Example: .\scripts\setup-phase2.ps1 -S3BucketName video-saas-us-east-1-123456789-dev" -ForegroundColor Yellow
    exit 1
}

$ErrorActionPreference = "Continue"

# Step 1: Create Cognito User Pool
Write-Host "Step 1: Creating Cognito User Pool..." -ForegroundColor Green
$rootDir = Split-Path $PSScriptRoot -Parent
$infrastructureDir = Join-Path $rootDir "backend"
$infrastructureDir = Join-Path $infrastructureDir "infrastructure"
$cognitoScript = Join-Path $infrastructureDir "create-cognito-user-pool.ps1"
& $cognitoScript -Region $Region

Write-Host "`nPlease note the User Pool ID and Client ID from above." -ForegroundColor Yellow
$userPoolId = Read-Host "Enter the User Pool ID"
$clientId = Read-Host "Enter the Client ID"

if ([string]::IsNullOrEmpty($userPoolId) -or [string]::IsNullOrEmpty($clientId)) {
    Write-Host "Error: User Pool ID and Client ID are required" -ForegroundColor Red
    exit 1
}

# Step 2: Check Lambda function (if not exists)
Write-Host "`nStep 2: Checking Lambda function..." -ForegroundColor Green
$lambdaFunctionName = "list-files"
$lambdaRoleName = "video-saas-lambda-role"

# Check if Lambda exists using list-functions
$lambdaList = aws lambda list-functions --region $Region --output json | ConvertFrom-Json
$lambdaExists = $lambdaList.Functions | Where-Object { $_.FunctionName -eq $lambdaFunctionName }

if (-not $lambdaExists) {
    Write-Host "Lambda function does not exist. Please create it first:" -ForegroundColor Yellow
    Write-Host "1. Package the Lambda function:" -ForegroundColor White
    Write-Host "   cd backend\lambdas\list-files" -ForegroundColor Gray
    Write-Host "   npm install" -ForegroundColor Gray
    Write-Host "   Compress index.js and node_modules into a zip file" -ForegroundColor Gray
    Write-Host "2. Create the function:" -ForegroundColor White
    Write-Host "   aws lambda create-function --function-name $lambdaFunctionName --runtime nodejs20.x --role arn:aws:iam::<account-id>:role/$lambdaRoleName --handler index.handler --zip-file fileb://function.zip --region $Region" -ForegroundColor Gray
    Write-Host "`nContinuing with other setup steps..." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Lambda function exists: $lambdaFunctionName" -ForegroundColor Green
}

# Step 3: Create IAM roles
Write-Host "`nStep 3: Creating IAM roles and policies..." -ForegroundColor Green
$iamScript = Join-Path $infrastructureDir "create-iam-roles.ps1"
& $iamScript -Region $Region -S3BucketName $S3BucketName

# Step 4: Create API Gateway
Write-Host "`nStep 4: Creating API Gateway..." -ForegroundColor Green
$apiGatewayScript = Join-Path $infrastructureDir "create-api-gateway.ps1"
& $apiGatewayScript -Region $Region -UserPoolId $userPoolId -LambdaFunctionName $lambdaFunctionName

Write-Host "`nPlease note the API Gateway URL from above." -ForegroundColor Yellow
$apiUrl = Read-Host "Enter the API Gateway URL (or press Enter to skip)"

# Step 5: Create environment file template
Write-Host "`nStep 5: Creating environment file template..." -ForegroundColor Green

$envContent = "# AWS Configuration
AWS_REGION=$Region
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Bucket Name
S3_BUCKET_NAME=$S3BucketName

# DynamoDB Table Name
DYNAMODB_TABLE_NAME=VideoSaaS

# Cognito Configuration (Phase 2)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$userPoolId
NEXT_PUBLIC_COGNITO_CLIENT_ID=$clientId
NEXT_PUBLIC_AWS_REGION=$Region

# API Gateway Configuration (Phase 2)
NEXT_PUBLIC_API_GATEWAY_URL=$apiUrl"

$frontendDir = Join-Path $rootDir "frontend"
$envFile = Join-Path $frontendDir ".env.local"
if (-not (Test-Path $envFile)) {
    $envContent | Out-File -FilePath $envFile -Encoding utf8
    Write-Host "[OK] Created .env.local file in frontend directory" -ForegroundColor Green
} else {
    Write-Host "[WARN] .env.local already exists. Please update it manually with the values above." -ForegroundColor Yellow
}

# Step 6: Summary
Write-Host "`n=== Phase 2 Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Update frontend/.env.local with the values above" -ForegroundColor White
Write-Host "2. Create a test user in Cognito:" -ForegroundColor White
Write-Host "   aws cognito-idp admin-create-user --user-pool-id $userPoolId --username test@example.com --user-attributes Name=email,Value=test@example.com --region $Region" -ForegroundColor Gray
Write-Host "3. Set a temporary password:" -ForegroundColor White
Write-Host "   aws cognito-idp admin-set-user-password --user-pool-id $userPoolId --username test@example.com --password TempPass123! --permanent --region $Region" -ForegroundColor Gray
Write-Host "4. Start the frontend:" -ForegroundColor White
Write-Host "   cd frontend" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host "5. Test login at http://localhost:3000/login" -ForegroundColor White
