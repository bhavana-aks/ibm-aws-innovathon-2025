# Prerequisites Setup Guide

This guide will help you install and configure all required tools for the Video SaaS Platform.

## Quick Start

Run the prerequisites check script:
```powershell
.\scripts\check-prerequisites.ps1
```

---

## 1. Git Installation

### Windows
1. Download from: https://git-scm.com/download/win
2. Run the installer with default settings
3. Verify: `git --version`
4. Configure (if not done):
   ```powershell
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```

---

## 2. Node.js Installation

### Windows
1. Download LTS version (v20.x) from: https://nodejs.org/
2. Run the installer
3. Verify:
   ```powershell
   node --version  # Should show v20.x.x
   npm --version   # Should show 10.x.x
   ```

### Alternative: Using nvm-windows (Recommended for managing multiple versions)
1. Download from: https://github.com/coreybutler/nvm-windows/releases
2. Install nvm-windows
3. Install Node.js:
   ```powershell
   nvm install 20
   nvm use 20
   ```

---

## 3. AWS CLI Installation

### Windows (MSI Installer - Recommended)
1. Download from: https://awscli.amazonaws.com/AWSCLIV2.msi
2. Run the installer
3. Verify: `aws --version`

### Alternative: Using PowerShell
```powershell
# Download installer
Invoke-WebRequest -Uri "https://awscli.amazonaws.com/AWSCLIV2.msi" -OutFile "$env:TEMP\AWSCLIV2.msi"

# Install
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\AWSCLIV2.msi /quiet" -Wait

# Verify
aws --version
```

### Configure AWS CLI
After installation, configure with your AWS credentials:
```powershell
aws configure
```

You'll need:
- **AWS Access Key ID**: Get from AWS Console → IAM → Users → Your User → Security credentials
- **AWS Secret Access Key**: Generated when you create an access key
- **Default region**: e.g., `us-east-1` or `us-west-2`
- **Default output format**: `json` (recommended)

### Verify Configuration
```powershell
aws sts get-caller-identity
```

This should return your AWS account ID and user ARN.

---

## 4. Docker Installation

### Windows
1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop/
2. Run the installer
3. Restart your computer if prompted
4. Start Docker Desktop
5. Verify:
   ```powershell
   docker --version
   docker ps  # Should not error
   ```

### Enable WSL 2 (if prompted)
Docker Desktop on Windows requires WSL 2. If you see a prompt:
1. Install WSL 2: https://docs.microsoft.com/en-us/windows/wsl/install
2. Restart Docker Desktop

---

## 5. Terraform Installation (Optional but Recommended)

### Windows (Using Chocolatey)
```powershell
choco install terraform
```

### Windows (Manual)
1. Download from: https://www.terraform.io/downloads
2. Extract to a folder (e.g., `C:\terraform`)
3. Add to PATH:
   - System Properties → Environment Variables
   - Add `C:\terraform` to Path
4. Verify: `terraform --version`

---

## 6. AWS Account Setup

### Create/Verify AWS Account
1. Go to: https://aws.amazon.com/
2. Sign up or sign in
3. Ensure billing is enabled (credit card required)

### Create IAM User (Recommended for Development)
1. Go to AWS Console → IAM → Users
2. Click "Create user"
3. Username: `video-saas-dev` (or your choice)
4. Select "Provide user access to the AWS Management Console" (optional)
5. For programmatic access, go to "Security credentials" tab
6. Click "Create access key"
7. Choose "Command Line Interface (CLI)"
8. **Save the Access Key ID and Secret Access Key** (you won't see the secret again!)
9. Use these credentials in `aws configure`

### Required IAM Permissions
For development, you can attach the `AdministratorAccess` policy (restrict in production):
1. IAM → Users → Your User → Permissions
2. Click "Add permissions" → "Attach policies directly"
3. Search for "AdministratorAccess" and attach

**For Production**: Create a custom policy with only required permissions:
- CloudFormation
- IAM
- Cognito
- DynamoDB
- S3
- Lambda
- Step Functions
- Bedrock
- Polly
- ECS
- VPC
- CloudFront
- API Gateway
- CloudWatch

---

## 7. AWS Bedrock Model Access (CRITICAL - Do This Early!)

Bedrock model access can take 24-48 hours to approve. Request immediately.

### Request Access
1. Go to AWS Console → Amazon Bedrock
2. Navigate to "Model access" in the left sidebar
3. Click "Manage model access"
4. Find "Claude 3.5 Sonnet" (or "Claude 3 Sonnet")
5. Click "Request" or check the box and click "Save changes"
6. Wait for approval (check email or console)

### Verify Access (After Approval)
```powershell
aws bedrock list-foundation-models --region us-east-1 --query "modelSummaries[?contains(modelId, 'claude')]"
```

---

## 8. Set Default AWS Region

```powershell
# Check current region
aws configure get region

# Set default region (if needed)
aws configure set region us-east-1

# Or set per-command
$env:AWS_DEFAULT_REGION = "us-east-1"
```

**Recommended Regions:**
- `us-east-1` (N. Virginia) - Best service availability
- `us-west-2` (Oregon) - Good alternative
- Check Bedrock availability in your region: https://docs.aws.amazon.com/bedrock/latest/userguide/regions.html

---

## 9. Verify Everything

Run the check script:
```powershell
.\scripts\check-prerequisites.ps1
```

All items should show ✓ (green checkmarks).

---

## Troubleshooting

### AWS CLI "Unable to locate credentials"
- Run `aws configure` and enter your credentials
- Check that credentials file exists: `~/.aws/credentials`

### Docker "Cannot connect to Docker daemon"
- Start Docker Desktop
- Wait for it to fully start (whale icon in system tray)

### Node.js version mismatch
- Use nvm-windows to manage multiple versions
- Or download the correct version from nodejs.org

### PowerShell execution policy error
If you get "execution of scripts is disabled":
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Next Steps

Once all prerequisites are installed:
1. ✅ Run `.\scripts\check-prerequisites.ps1` to verify
2. ✅ Request Bedrock access (if not done)
3. ✅ Initialize Git repository (if not already done)
4. ✅ Proceed to Phase 1: Foundation & Data Layer

