# 07-12-25: Fixed for Windows PowerShell compatibility
# Phase 5: Video Recording - ECR Repository Setup

param(
    [string]$RepositoryName = "video-saas-recorder",
    [string]$Region = "us-east-1"
)

Write-Host "=== Creating ECR Repository ===" -ForegroundColor Cyan
Write-Host "Repository: $RepositoryName"
Write-Host "Region: $Region"
Write-Host ""

# Check if repository already exists
try {
    $existingRepo = aws ecr describe-repositories `
        --repository-names $RepositoryName `
        --region $Region 2>$null | ConvertFrom-Json

    if ($existingRepo) {
        Write-Host "Repository already exists!" -ForegroundColor Yellow
        $repoUri = $existingRepo.repositories[0].repositoryUri
        Write-Host "Repository URI: $repoUri" -ForegroundColor Green
        return
    }
} catch {
    # Repository doesn't exist, continue to create
}

# Create ECR repository
Write-Host "Creating ECR repository..." -ForegroundColor Yellow
$result = aws ecr create-repository `
    --repository-name $RepositoryName `
    --region $Region `
    --image-scanning-configuration scanOnPush=true `
    --encryption-configuration encryptionType=AES256 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create ECR repository: $result" -ForegroundColor Red
    exit 1
}

$resultJson = $result | ConvertFrom-Json
$repoUri = $resultJson.repository.repositoryUri
$registryId = $resultJson.repository.registryId

Write-Host ""
Write-Host "=== ECR Repository Created ===" -ForegroundColor Green
Write-Host "Repository URI: $repoUri"
Write-Host "Registry ID: $registryId"
Write-Host ""

# Set lifecycle policy to clean up old images
Write-Host "Setting lifecycle policy..." -ForegroundColor Yellow

$lifecyclePolicy = @{
    rules = @(
        @{
            rulePriority = 1
            description = "Keep last 10 images"
            selection = @{
                tagStatus = "any"
                countType = "imageCountMoreThan"
                countNumber = 10
            }
            action = @{
                type = "expire"
            }
        }
    )
} | ConvertTo-Json -Depth 10 -Compress

# Write to temp file (UTF8 without BOM for AWS CLI)
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $lifecyclePolicy)

aws ecr put-lifecycle-policy `
    --repository-name $RepositoryName `
    --region $Region `
    --lifecycle-policy-text "file://$tempFile" 2>$null

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Lifecycle policy set." -ForegroundColor Green
Write-Host ""

# Output instructions for pushing images
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Authenticate Docker with ECR:"
Write-Host "   aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registryId.dkr.ecr.$Region.amazonaws.com"
Write-Host ""
Write-Host "2. Build and tag your image:"
Write-Host "   docker build -t $RepositoryName ./fargate"
Write-Host "   docker tag ${RepositoryName}:latest ${repoUri}:latest"
Write-Host ""
Write-Host "3. Push to ECR:"
Write-Host "   docker push ${repoUri}:latest"
Write-Host ""

Write-Host "=== ECR Setup Complete ===" -ForegroundColor Green
