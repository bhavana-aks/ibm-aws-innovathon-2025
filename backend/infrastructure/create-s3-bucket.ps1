# Create S3 Bucket for Video SaaS Platform
# This script creates the S3 bucket with versioning and folder structure

Write-Host "Creating S3 bucket for Video SaaS Platform" -ForegroundColor Green

# Get AWS account ID and region
$accountId = aws sts get-caller-identity --query Account --output text
$region = aws configure get region
if (-not $region) {
    $region = "us-east-1"
    Write-Host "No region configured, defaulting to us-east-1" -ForegroundColor Yellow
}

$bucketName = "video-saas-$region-$accountId-dev"
Write-Host "Bucket name: $bucketName" -ForegroundColor Cyan

# Check if bucket already exists
$existingBucket = aws s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Bucket $bucketName already exists. Skipping creation." -ForegroundColor Yellow
} else {
    # Create bucket
    if ($region -eq "us-east-1") {
        aws s3api create-bucket --bucket $bucketName --region $region
    } else {
        aws s3api create-bucket --bucket $bucketName --region $region --create-bucket-configuration LocationConstraint=$region
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Bucket $bucketName created successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to create bucket. Please check AWS credentials and permissions." -ForegroundColor Red
        exit 1
    }
}

# Enable versioning
Write-Host "Enabling versioning..." -ForegroundColor Yellow
aws s3api put-bucket-versioning `
    --bucket $bucketName `
    --versioning-configuration Status=Enabled

# Create folder structure
Write-Host "Creating folder structure..." -ForegroundColor Yellow
aws s3api put-object --bucket $bucketName --key lib/ --content-length 0
aws s3api put-object --bucket $bucketName --key audio/ --content-length 0
aws s3api put-object --bucket $bucketName --key videos/ --content-length 0

# Set CORS configuration
Write-Host "Setting CORS configuration..." -ForegroundColor Yellow
$corsConfig = @{
    CORSRules = @(
        @{
            AllowedOrigins = @("*")
            AllowedMethods = @("GET", "PUT", "POST", "HEAD")
            AllowedHeaders = @("*")
            ExposeHeaders = @("ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2")
            MaxAgeSeconds = 3000
        }
    )
} | ConvertTo-Json -Depth 10

# Write JSON file without BOM (Byte Order Mark) - AWS CLI doesn't accept BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$env:TEMP\cors-config.json", $corsConfig, $utf8NoBom)
aws s3api put-bucket-cors --bucket $bucketName --cors-configuration file://"$env:TEMP\cors-config.json"
Remove-Item "$env:TEMP\cors-config.json"

Write-Host "S3 bucket setup complete!" -ForegroundColor Green
Write-Host "Bucket name: $bucketName" -ForegroundColor Cyan
Write-Host "Save this bucket name for your environment variables." -ForegroundColor Yellow


