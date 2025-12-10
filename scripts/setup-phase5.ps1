# 07-12-25: Fixed for Windows PowerShell compatibility
# Phase 5: Video Recording Infrastructure Setup

param(
    [string]$Region = "us-east-1",
    [switch]$SkipDocker = $false,
    [switch]$SkipInfra = $false,
    [switch]$SkipPush = $false
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Video SaaS - Phase 5 Setup               " -ForegroundColor Cyan
Write-Host "   Video Recording Infrastructure           " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot
$infraDir = Join-Path $rootDir "backend\infrastructure"
$fargateDir = Join-Path $rootDir "fargate"

# Get AWS Account ID
$accountId = aws sts get-caller-identity --query Account --output text 2>$null
if (-not $accountId) {
    Write-Host "ERROR: Could not get AWS account ID. Make sure AWS CLI is configured." -ForegroundColor Red
    exit 1
}
Write-Host "AWS Account: $accountId" -ForegroundColor Gray
Write-Host "Region: $Region" -ForegroundColor Gray
Write-Host ""

# Step 1: Create ECS Service-Linked Role (required first)
if (-not $SkipInfra) {
    Write-Host "Step 1: Creating ECS Service-Linked Role..." -ForegroundColor Yellow
    aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com 2>$null
    Write-Host "ECS service-linked role ready." -ForegroundColor Green
    Write-Host ""
}

# Step 2: Create ECR Repository
if (-not $SkipInfra) {
    Write-Host "Step 2: Creating ECR Repository..." -ForegroundColor Yellow
    & "$infraDir\create-ecr-repository.ps1" -Region $Region
    Write-Host ""
}

# Step 3: Create ECS Cluster
if (-not $SkipInfra) {
    Write-Host "Step 3: Creating ECS Cluster..." -ForegroundColor Yellow
    & "$infraDir\create-ecs-cluster.ps1" -Region $Region
    Write-Host ""
}

# Step 4: Create IAM Roles
if (-not $SkipInfra) {
    Write-Host "Step 4: Creating ECS IAM Roles..." -ForegroundColor Yellow
    & "$infraDir\create-ecs-task-role.ps1" -Region $Region
    Write-Host ""
}

# Step 5: Build Docker Image
if (-not $SkipDocker) {
    Write-Host "Step 5: Building Docker Image..." -ForegroundColor Yellow
    
    Push-Location $fargateDir
    
    # Check if package.json exists
    if (-not (Test-Path "package.json")) {
        Write-Host "ERROR: package.json not found in $fargateDir" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    # Install dependencies
    Write-Host "Installing npm dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    # Build TypeScript
    Write-Host "Building TypeScript..." -ForegroundColor Gray
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "TypeScript build failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    # Build Docker image with progress output
    Write-Host "Building Docker image (this may take 10-20 minutes on first run)..." -ForegroundColor Gray
    docker build -t video-saas-recorder . --progress=plain
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker image built successfully!" -ForegroundColor Green
    } else {
        Write-Host "Docker build failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host ""
}

# Step 6: Push to ECR
if (-not $SkipDocker -and -not $SkipPush) {
    Write-Host "Step 6: Pushing Docker Image to ECR..." -ForegroundColor Yellow
    
    $ecrUri = "$accountId.dkr.ecr.$Region.amazonaws.com"
    $repoUri = "$ecrUri/video-saas-recorder"
    
    # Authenticate Docker with ECR
    Write-Host "Authenticating with ECR..." -ForegroundColor Gray
    $loginPassword = aws ecr get-login-password --region $Region
    $loginPassword | docker login --username AWS --password-stdin $ecrUri
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ECR authentication failed!" -ForegroundColor Red
        exit 1
    }
    
    # Tag and push
    Write-Host "Tagging and pushing image..." -ForegroundColor Gray
    docker tag video-saas-recorder:latest "${repoUri}:latest"
    docker push "${repoUri}:latest"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Image pushed to ECR successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to push image to ECR!" -ForegroundColor Red
    }
    Write-Host ""
}

# Step 7: Create Task Definition
if (-not $SkipInfra) {
    Write-Host "Step 7: Creating ECS Task Definition..." -ForegroundColor Yellow
    & "$infraDir\create-ecs-task-definition.ps1" -Region $Region
    Write-Host ""
}

# Get default VPC info for user
Write-Host "============================================" -ForegroundColor Green
Write-Host "   Phase 5 Setup Complete!                  " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Get VPC and subnet info
Write-Host "Getting VPC information for configuration..." -ForegroundColor Yellow
$defaultVpc = aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text --region $Region 2>$null
if ($defaultVpc -and $defaultVpc -ne "None") {
    Write-Host "Default VPC: $defaultVpc" -ForegroundColor Cyan
    
    $subnets = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$defaultVpc" --query "Subnets[*].SubnetId" --output text --region $Region 2>$null
    Write-Host "Subnets: $subnets" -ForegroundColor Cyan
    
    # Get or create security group
    $sgName = "video-recorder-sg"
    $existingSg = aws ec2 describe-security-groups --filters "Name=group-name,Values=$sgName" "Name=vpc-id,Values=$defaultVpc" --query "SecurityGroups[0].GroupId" --output text --region $Region 2>$null
    
    if (-not $existingSg -or $existingSg -eq "None") {
        Write-Host "Creating security group..." -ForegroundColor Gray
        $sgId = aws ec2 create-security-group --group-name $sgName --description "Video recorder Fargate security group" --vpc-id $defaultVpc --query "GroupId" --output text --region $Region 2>$null
        
        # Allow all outbound traffic
        aws ec2 authorize-security-group-egress --group-id $sgId --protocol all --cidr 0.0.0.0/0 --region $Region 2>$null
    } else {
        $sgId = $existingSg
    }
    Write-Host "Security Group: $sgId" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "Add these to your frontend/.env.local:" -ForegroundColor Yellow
    Write-Host "ECS_CLUSTER_NAME=video-saas-cluster"
    Write-Host "ECS_TASK_FAMILY=video-saas-recorder"
    Write-Host "ECS_SUBNETS=$($subnets -replace '\s+', ',')"
    Write-Host "ECS_SECURITY_GROUPS=$sgId"
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Add the environment variables above to frontend/.env.local"
Write-Host "2. Start the frontend: cd frontend && npm run dev"
Write-Host "3. Navigate to a project in RENDERING status"
Write-Host "4. Click 'Generate Video' to test"
Write-Host ""
