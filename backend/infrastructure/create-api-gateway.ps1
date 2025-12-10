# 15-01-25: Created API Gateway setup script with Cognito authorizer
# 16-01-25: Fixed encoding issues
# Creates API Gateway REST API with Cognito authorizer for Phase 2

param(
    [string]$Region = "us-east-1",
    [string]$ApiName = "video-saas-api",
    [string]$UserPoolId = "",
    [string]$LambdaFunctionName = "list-files"
)

if ([string]::IsNullOrEmpty($UserPoolId)) {
    Write-Host "Error: UserPoolId is required" -ForegroundColor Red
    Write-Host "Usage: .\create-api-gateway.ps1 -UserPoolId <user-pool-id>" -ForegroundColor Yellow
    exit 1
}

Write-Host "Creating API Gateway: $ApiName" -ForegroundColor Green

# Step 1: Create REST API
Write-Host "`nStep 1: Creating REST API..." -ForegroundColor Yellow

$apiResponse = aws apigateway create-rest-api `
    --name $ApiName `
    --region $Region `
    --description "Video SaaS Platform API" `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error creating REST API" -ForegroundColor Red
    exit 1
}

$api = $apiResponse | ConvertFrom-Json
$apiId = $api.Id
$rootResourceId = $api.RootResourceId

Write-Host "[OK] REST API created: $apiId" -ForegroundColor Green

# Step 2: Create Cognito Authorizer
Write-Host "`nStep 2: Creating Cognito Authorizer..." -ForegroundColor Yellow

$authorizerResponse = aws apigateway create-authorizer `
    --rest-api-id $apiId `
    --name "CognitoAuthorizer" `
    --type COGNITO_USER_POOLS `
    --provider-arns "arn:aws:cognito-idp:$Region`:$(aws sts get-caller-identity --query Account --output text):userpool/$UserPoolId" `
    --identity-source "method.request.header.Authorization" `
    --region $Region `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error creating Cognito Authorizer" -ForegroundColor Red
    exit 1
}

$authorizer = $authorizerResponse | ConvertFrom-Json
$authorizerId = $authorizer.Id

Write-Host "[OK] Cognito Authorizer created: $authorizerId" -ForegroundColor Green

# Step 3: Create /files resource
Write-Host "`nStep 3: Creating /files resource..." -ForegroundColor Yellow

$filesResourceResponse = aws apigateway create-resource `
    --rest-api-id $apiId `
    --parent-id $rootResourceId `
    --path-part "files" `
    --region $Region `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error creating /files resource" -ForegroundColor Red
    exit 1
}

$filesResource = $filesResourceResponse | ConvertFrom-Json
$filesResourceId = $filesResource.Id

Write-Host "[OK] /files resource created: $filesResourceId" -ForegroundColor Green

# Step 4: Create GET method
Write-Host "`nStep 4: Creating GET method..." -ForegroundColor Yellow

# Get Lambda function ARN
$lambdaArn = "arn:aws:lambda:$Region`:$(aws sts get-caller-identity --query Account --output text):function:$LambdaFunctionName"

aws apigateway put-method `
    --rest-api-id $apiId `
    --resource-id $filesResourceId `
    --http-method GET `
    --authorization-type COGNITO_USER_POOLS `
    --authorizer-id $authorizerId `
    --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error creating GET method" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] GET method created" -ForegroundColor Green

# Step 5: Set up Lambda integration
Write-Host "`nStep 5: Setting up Lambda integration..." -ForegroundColor Yellow

aws apigateway put-integration `
    --rest-api-id $apiId `
    --resource-id $filesResourceId `
    --http-method GET `
    --type AWS_PROXY `
    --integration-http-method POST `
    --uri "arn:aws:apigateway:$Region`:lambda:path/2015-03-31/functions/$lambdaArn/invocations" `
    --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error setting up Lambda integration" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Lambda integration configured" -ForegroundColor Green

# Step 6: Deploy API
Write-Host "`nStep 6: Deploying API..." -ForegroundColor Yellow

aws apigateway create-deployment `
    --rest-api-id $apiId `
    --stage-name "prod" `
    --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error deploying API" -ForegroundColor Red
    exit 1
}

$apiUrl = "https://$apiId.execute-api.$Region.amazonaws.com/prod"

Write-Host "[OK] API deployed" -ForegroundColor Green

# Step 7: Output configuration
Write-Host "`n=== Configuration ===" -ForegroundColor Cyan
Write-Host "API ID: $apiId" -ForegroundColor White
Write-Host "API URL: $apiUrl" -ForegroundColor White
Write-Host "Authorizer ID: $authorizerId" -ForegroundColor White
Write-Host "Files Endpoint: $apiUrl/files" -ForegroundColor White

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Add to your frontend .env.local:" -ForegroundColor Yellow
Write-Host "   NEXT_PUBLIC_API_GATEWAY_URL=$apiUrl" -ForegroundColor White
Write-Host "`n2. Grant API Gateway permission to invoke Lambda:" -ForegroundColor Yellow
Write-Host "   aws lambda add-permission --function-name $LambdaFunctionName --statement-id apigateway-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn `"arn:aws:execute-api:$Region`:$(aws sts get-caller-identity --query Account --output text):$apiId/*/GET/files`" --region $Region" -ForegroundColor White

Write-Host "`n[OK] API Gateway setup complete!" -ForegroundColor Green
