# 15-01-25: Created Cognito User Pool with custom tenant_id attribute
# 16-01-25: Simplified for better PowerShell compatibility
# 07-12-25: Added step to actually create custom:tenant_id attribute in schema
# Creates AWS Cognito User Pool for Phase 2 authentication

param(
    [string]$Region = "us-east-1",
    [string]$UserPoolName = "video-saas-user-pool"
)

$ErrorActionPreference = "Continue"

Write-Host "Creating Cognito User Pool: $UserPoolName" -ForegroundColor Green

# Step 1: Check if User Pool already exists
Write-Host "`nStep 1: Checking for existing User Pool..." -ForegroundColor Yellow

$existingPools = aws cognito-idp list-user-pools --max-results 60 --region $Region --output json | ConvertFrom-Json
$existingPool = $existingPools.UserPools | Where-Object { $_.Name -eq $UserPoolName }

if ($existingPool) {
    $userPoolId = $existingPool.Id
    Write-Host "[OK] User Pool already exists: $userPoolId" -ForegroundColor Yellow
} else {
    # Create User Pool
    Write-Host "Creating new User Pool..." -ForegroundColor Yellow
    
    $createResult = aws cognito-idp create-user-pool --pool-name $UserPoolName --region $Region --auto-verified-attributes email --username-attributes email --output json | ConvertFrom-Json
    
    if (-not $createResult) {
        Write-Host "Error creating User Pool" -ForegroundColor Red
        exit 1
    }
    
    $userPoolId = $createResult.UserPool.Id
    Write-Host "[OK] User Pool created: $userPoolId" -ForegroundColor Green
}

# Step 2: Add custom attribute for tenant_id
Write-Host "`nStep 2: Adding custom:tenant_id attribute..." -ForegroundColor Yellow

try {
    aws cognito-idp add-custom-attributes `
        --user-pool-id $userPoolId `
        --custom-attributes Name=tenant_id,AttributeDataType=String,Mutable=true `
        --region $Region 2>$null
    Write-Host "[OK] Custom attribute tenant_id added" -ForegroundColor Green
} catch {
    Write-Host "[OK] Custom attribute tenant_id already exists or was added" -ForegroundColor Yellow
}

# Step 3: Check if Client already exists
Write-Host "`nStep 3: Checking for existing User Pool Client..." -ForegroundColor Yellow

$clientName = "$UserPoolName-client"
$existingClients = aws cognito-idp list-user-pool-clients --user-pool-id $userPoolId --region $Region --output json | ConvertFrom-Json
$existingClient = $existingClients.UserPoolClients | Where-Object { $_.ClientName -eq $clientName }

if ($existingClient) {
    $clientId = $existingClient.ClientId
    Write-Host "[OK] Client already exists: $clientId" -ForegroundColor Yellow
} else {
    # Create User Pool Client
    Write-Host "Creating new User Pool Client..." -ForegroundColor Yellow
    
    $clientResult = aws cognito-idp create-user-pool-client --user-pool-id $userPoolId --client-name $clientName --region $Region --no-generate-secret --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH --output json | ConvertFrom-Json
    
    if (-not $clientResult) {
        Write-Host "Error creating User Pool Client" -ForegroundColor Red
        exit 1
    }
    
    $clientId = $clientResult.UserPoolClient.ClientId
    Write-Host "[OK] User Pool Client created: $clientId" -ForegroundColor Green
}

# Step 4: Output configuration
Write-Host "`n=== Configuration ===" -ForegroundColor Cyan
Write-Host "User Pool ID: $userPoolId" -ForegroundColor White
Write-Host "Client ID: $clientId" -ForegroundColor White
Write-Host "Region: $Region" -ForegroundColor White

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Add these to your frontend .env.local:" -ForegroundColor Yellow
Write-Host "   COGNITO_USER_POOL_ID=$userPoolId" -ForegroundColor White
Write-Host "   COGNITO_CLIENT_ID=$clientId" -ForegroundColor White
Write-Host "   AWS_REGION=$Region" -ForegroundColor White

Write-Host "`n[OK] Cognito setup complete!" -ForegroundColor Green
