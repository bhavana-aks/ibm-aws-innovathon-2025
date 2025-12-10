# Update S3 Bucket CORS Configuration
# This script updates the CORS configuration for an existing S3 bucket

param(
    [string]$BucketName = ""
)

Write-Host "Updating S3 bucket CORS configuration" -ForegroundColor Green

# Get bucket name if not provided
if (-not $BucketName) {
    $accountId = aws sts get-caller-identity --query Account --output text
    $region = aws configure get region
    if (-not $region) {
        $region = "us-east-1"
        Write-Host "No region configured, defaulting to us-east-1" -ForegroundColor Yellow
    }
    $BucketName = "video-saas-$region-$accountId-dev"
}

Write-Host "Bucket name: $BucketName" -ForegroundColor Cyan

# Check if bucket exists
$existingBucket = aws s3api head-bucket --bucket $BucketName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Bucket $BucketName does not exist. Please create it first." -ForegroundColor Red
    exit 1
}

# Set CORS configuration with proper settings for presigned URL uploads
Write-Host "Updating CORS configuration..." -ForegroundColor Yellow
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
aws s3api put-bucket-cors --bucket $BucketName --cors-configuration file://"$env:TEMP\cors-config.json"

if ($LASTEXITCODE -eq 0) {
    Write-Host "CORS configuration updated successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to update CORS configuration. Please check AWS credentials and permissions." -ForegroundColor Red
    exit 1
}

Remove-Item "$env:TEMP\cors-config.json"

Write-Host "CORS update complete!" -ForegroundColor Green



