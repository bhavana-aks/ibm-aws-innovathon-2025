# 07-12-25: Fixed for Windows PowerShell compatibility
# Phase 5: Video Recording - Fargate Task Definition

param(
    [string]$TaskFamily = "video-saas-recorder",
    [string]$ClusterName = "video-saas-cluster",
    [string]$EcrRepositoryUri = "",
    [string]$TaskRoleArn = "",
    [string]$ExecutionRoleArn = "",
    [string]$Region = "us-east-1",
    [int]$Cpu = 2048,        # 2 vCPU
    [int]$Memory = 4096      # 4 GB
)

Write-Host "=== Creating ECS Task Definition ===" -ForegroundColor Cyan
Write-Host "Task Family: $TaskFamily"
Write-Host "CPU: $Cpu | Memory: $Memory MB"
Write-Host ""

# Get AWS Account ID
$accountId = (aws sts get-caller-identity --query Account --output text)

# Set defaults if not provided
if (-not $EcrRepositoryUri) {
    $EcrRepositoryUri = "$accountId.dkr.ecr.$Region.amazonaws.com/video-saas-recorder:latest"
}
if (-not $TaskRoleArn) {
    $TaskRoleArn = "arn:aws:iam::${accountId}:role/VideoSaaSECSTaskRole"
}
if (-not $ExecutionRoleArn) {
    $ExecutionRoleArn = "arn:aws:iam::${accountId}:role/VideoSaaSECSExecutionRole"
}

Write-Host "ECR Image: $EcrRepositoryUri"
Write-Host "Task Role: $TaskRoleArn"
Write-Host "Execution Role: $ExecutionRoleArn"
Write-Host ""

# Create task definition JSON
$taskDefinition = @{
    family = $TaskFamily
    networkMode = "awsvpc"
    requiresCompatibilities = @("FARGATE")
    cpu = $Cpu.ToString()
    memory = $Memory.ToString()
    taskRoleArn = $TaskRoleArn
    executionRoleArn = $ExecutionRoleArn
    containerDefinitions = @(
        @{
            name = "video-recorder"
            image = $EcrRepositoryUri
            essential = $true
            portMappings = @(
                @{
                    containerPort = 3000
                    hostPort = 3000
                    protocol = "tcp"
                }
            )
            environment = @(
                @{ name = "AWS_REGION"; value = $Region }
                @{ name = "NODE_ENV"; value = "production" }
            )
            logConfiguration = @{
                logDriver = "awslogs"
                options = @{
                    "awslogs-group" = "/ecs/$ClusterName"
                    "awslogs-region" = $Region
                    "awslogs-stream-prefix" = "video-recorder"
                }
            }
            linuxParameters = @{
                initProcessEnabled = $true
            }
        }
    )
}

# Convert to JSON
$taskDefinitionJson = $taskDefinition | ConvertTo-Json -Depth 10

# Save to temp file (UTF8 without BOM for AWS CLI)
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $taskDefinitionJson)

Write-Host "Registering task definition..." -ForegroundColor Yellow

# Register task definition
$result = aws ecs register-task-definition `
    --cli-input-json "file://$tempFile" `
    --region $Region 2>&1

# Clean up temp file
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to register task definition: $result" -ForegroundColor Red
    exit 1
}

$resultJson = $result | ConvertFrom-Json
$taskDefinitionArn = $resultJson.taskDefinition.taskDefinitionArn
$revision = $resultJson.taskDefinition.revision

Write-Host ""
Write-Host "=== Task Definition Registered ===" -ForegroundColor Green
Write-Host "ARN: $taskDefinitionArn"
Write-Host "Revision: $revision"
Write-Host ""

Write-Host "=== Task Definition Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "To run a task manually:" -ForegroundColor Cyan
Write-Host "aws ecs run-task --cluster $ClusterName --task-definition $TaskFamily --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}'"
