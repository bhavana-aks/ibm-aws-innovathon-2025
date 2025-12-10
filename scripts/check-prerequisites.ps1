# Prerequisites Check Script for Video SaaS Platform
# Run this script to verify all required tools are installed

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video SaaS Platform - Prerequisites Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Helper function to check command
function Test-Command {
    param([string]$Command, [string]$Name)
    try {
        $output = & $Command 2>&1
        if ($LASTEXITCODE -eq 0 -or $?) {
            return $true, $output
        } else {
            return $false, $null
        }
    } catch {
        return $false, $null
    }
}

# 1. Check Git
Write-Host "1. Checking Git..." -ForegroundColor Yellow
$gitInstalled, $gitVersion = Test-Command "git" "--version"
if ($gitInstalled) {
    Write-Host "   [OK] Git installed: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "   [FAIL] Git not found" -ForegroundColor Red
    Write-Host "   Install from: https://git-scm.com/download/win" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# 2. Check Node.js
Write-Host "2. Checking Node.js..." -ForegroundColor Yellow
$nodeInstalled, $nodeVersion = Test-Command "node" "--version"
if ($nodeInstalled) {
    $nodeVersionNum = $nodeVersion -replace 'v', '' -replace "`r`n", ''
    $majorVersion = [int]($nodeVersionNum -split '\.')[0]
    if ($majorVersion -ge 20) {
        Write-Host "   [OK] Node.js installed: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] Node.js version too old: $nodeVersion (Need v20+)" -ForegroundColor Yellow
        Write-Host "   Update from: https://nodejs.org/" -ForegroundColor Yellow
        $allGood = $false
    }
} else {
    Write-Host "   [FAIL] Node.js not found" -ForegroundColor Red
    Write-Host "   Install from: https://nodejs.org/ (LTS v20.x)" -ForegroundColor Yellow
    $allGood = $false
}

$npmInstalled, $npmVersion = Test-Command "npm" "--version"
if ($npmInstalled) {
    Write-Host "   [OK] npm installed: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "   [WARN] npm not found" -ForegroundColor Yellow
}
Write-Host ""

# 3. Check AWS CLI
Write-Host "3. Checking AWS CLI..." -ForegroundColor Yellow
$awsInstalled, $awsVersion = Test-Command "aws" "--version"
if ($awsInstalled) {
    Write-Host "   [OK] AWS CLI installed: $awsVersion" -ForegroundColor Green
    
    # Check if configured
    $awsConfigured, $awsIdentity = Test-Command "aws" "sts get-caller-identity"
    if ($awsConfigured) {
        Write-Host "   [OK] AWS CLI configured" -ForegroundColor Green
        try {
            $identityJson = $awsIdentity | ConvertFrom-Json
            Write-Host "   Account: $($identityJson.Account)" -ForegroundColor Gray
            Write-Host "   User/Role: $($identityJson.Arn)" -ForegroundColor Gray
        } catch {
            # Ignore JSON parse errors
        }
    } else {
        Write-Host "   [WARN] AWS CLI not configured" -ForegroundColor Yellow
        Write-Host "   Run: aws configure" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [FAIL] AWS CLI not found" -ForegroundColor Red
    Write-Host "   Install from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# 4. Check Docker
Write-Host "4. Checking Docker..." -ForegroundColor Yellow
$dockerInstalled, $dockerVersion = Test-Command "docker" "--version"
if ($dockerInstalled) {
    Write-Host "   [OK] Docker installed: $dockerVersion" -ForegroundColor Green
    
    # Check if Docker daemon is running
    $dockerRunning, $null = Test-Command "docker" "ps"
    if ($dockerRunning) {
        Write-Host "   [OK] Docker daemon is running" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] Docker daemon not running" -ForegroundColor Yellow
        Write-Host "   Start Docker Desktop" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [FAIL] Docker not found" -ForegroundColor Red
    Write-Host "   Install from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# 5. Check Terraform (Optional)
Write-Host "5. Checking Terraform (Optional)..." -ForegroundColor Yellow
$terraformInstalled, $terraformVersion = Test-Command "terraform" "--version"
if ($terraformInstalled) {
    $firstLine = ($terraformVersion -split "`n" | Select-Object -First 1)
    Write-Host "   [OK] Terraform installed: $firstLine" -ForegroundColor Green
} else {
    Write-Host "   [INFO] Terraform not found (Optional)" -ForegroundColor Gray
    Write-Host "   Install from: https://www.terraform.io/downloads" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "[SUCCESS] All required prerequisites are installed!" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Some prerequisites are missing. Please install them before proceeding." -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Next Steps
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. If AWS CLI is not configured, run: aws configure" -ForegroundColor White
Write-Host "2. Request Bedrock access: AWS Console -> Bedrock -> Model access -> Request access for Claude 3.5 Sonnet" -ForegroundColor White
Write-Host "3. Verify AWS region: aws configure get region" -ForegroundColor White
Write-Host ""

