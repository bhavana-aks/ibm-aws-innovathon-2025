# Create DynamoDB Table for Video SaaS Platform
# This script creates the VideoSaaS table with the required schema

Write-Host "Creating DynamoDB table: VideoSaaS" -ForegroundColor Green

$tableName = "VideoSaaS"

# Check if table already exists
$existingTable = aws dynamodb describe-table --table-name $tableName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Table $tableName already exists. Skipping creation." -ForegroundColor Yellow
    exit 0
}

# Create the table
aws dynamodb create-table `
    --table-name $tableName `
    --attribute-definitions `
        AttributeName=PK,AttributeType=S `
        AttributeName=SK,AttributeType=S `
    --key-schema `
        AttributeName=PK,KeyType=HASH `
        AttributeName=SK,KeyType=RANGE `
    --billing-mode PAY_PER_REQUEST

if ($LASTEXITCODE -eq 0) {
    Write-Host "Table $tableName created successfully!" -ForegroundColor Green
    Write-Host "Waiting for table to become active..." -ForegroundColor Yellow
    aws dynamodb wait table-exists --table-name $tableName
    Write-Host "Table is now active!" -ForegroundColor Green
    
    # Enable Point-in-Time Recovery
    Write-Host "Enabling Point-in-Time Recovery..." -ForegroundColor Yellow
    aws dynamodb update-continuous-backups `
        --table-name $tableName `
        --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Point-in-Time Recovery enabled successfully!" -ForegroundColor Green
    } else {
        Write-Host "Warning: Failed to enable Point-in-Time Recovery. Table created but PITR not enabled." -ForegroundColor Yellow
    }
} else {
    Write-Host "Failed to create table. Please check AWS credentials and permissions." -ForegroundColor Red
    exit 1
}

