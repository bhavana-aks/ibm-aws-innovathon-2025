# Phase 1 Setup Script
# This script helps set up the infrastructure and environment for Phase 1

Write-Host "=== Phase 1 Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create DynamoDB Table
Write-Host "Step 1: Creating DynamoDB table..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\backend\infrastructure"
try {
    .\create-dynamodb-table.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "DynamoDB table creation failed!" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host ""

# Step 2: Create S3 Bucket
Write-Host "Step 2: Creating S3 bucket..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\backend\infrastructure"
try {
    $bucketOutput = .\create-s3-bucket.ps1
    # Extract bucket name from output if possible
} finally {
    Pop-Location
}

Write-Host ""

# Step 3: Setup Frontend Environment
Write-Host "Step 3: Setting up frontend environment..." -ForegroundColor Yellow
$frontendPath = "$PSScriptRoot\..\frontend"
$envExample = "$frontendPath\env.example"
$envLocal = "$frontendPath\.env.local"

if (-not (Test-Path $envLocal)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envLocal
        Write-Host "Created .env.local from template." -ForegroundColor Green
        Write-Host "Please edit frontend/.env.local and add your AWS credentials and bucket name." -ForegroundColor Yellow
    } else {
        Write-Host "env.example not found. Please create .env.local manually." -ForegroundColor Yellow
    }
} else {
    Write-Host ".env.local already exists. Skipping." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit frontend/.env.local with your AWS credentials" -ForegroundColor White
Write-Host "2. Add the S3 bucket name from Step 2" -ForegroundColor White
Write-Host "3. Run 'cd frontend && npm run dev' to start the development server" -ForegroundColor White
Write-Host "4. Open http://localhost:3000 and test file upload" -ForegroundColor White

