# 07-12-25: Fixed for Windows PowerShell compatibility
# Phase 5: Video Recording - ECS Cluster Setup

param(
    [string]$ClusterName = "video-saas-cluster",
    [string]$Region = "us-east-1"
)

Write-Host "=== Creating ECS Cluster ===" -ForegroundColor Cyan
Write-Host "Cluster: $ClusterName"
Write-Host "Region: $Region"
Write-Host ""

# First, ensure ECS service-linked role exists
Write-Host "Ensuring ECS service-linked role exists..." -ForegroundColor Yellow
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com 2>$null
# Ignore error if role already exists

# Check if cluster already exists
$existingCluster = aws ecs describe-clusters `
    --clusters $ClusterName `
    --region $Region 2>$null | ConvertFrom-Json

if ($existingCluster.clusters.Count -gt 0 -and $existingCluster.clusters[0].status -eq "ACTIVE") {
    Write-Host "Cluster already exists and is ACTIVE!" -ForegroundColor Yellow
    $clusterArn = $existingCluster.clusters[0].clusterArn
    Write-Host "Cluster ARN: $clusterArn" -ForegroundColor Green
    return
}

# Create ECS cluster (simplified - without capacity providers for initial creation)
Write-Host "Creating ECS cluster..." -ForegroundColor Yellow
$result = aws ecs create-cluster `
    --cluster-name $ClusterName `
    --region $Region `
    --settings "name=containerInsights,value=enabled" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create ECS cluster: $result" -ForegroundColor Red
    exit 1
}

$resultJson = $result | ConvertFrom-Json
$clusterArn = $resultJson.cluster.clusterArn
$clusterStatus = $resultJson.cluster.status

Write-Host ""
Write-Host "=== ECS Cluster Created ===" -ForegroundColor Green
Write-Host "Cluster ARN: $clusterArn"
Write-Host "Status: $clusterStatus"
Write-Host ""

# Create CloudWatch log group for container logs
$logGroupName = "/ecs/$ClusterName"
Write-Host "Creating CloudWatch log group: $logGroupName" -ForegroundColor Yellow

aws logs create-log-group `
    --log-group-name $logGroupName `
    --region $Region 2>$null

aws logs put-retention-policy `
    --log-group-name $logGroupName `
    --retention-in-days 7 `
    --region $Region 2>$null

Write-Host "CloudWatch log group created with 7-day retention." -ForegroundColor Green
Write-Host ""

Write-Host "=== ECS Cluster Setup Complete ===" -ForegroundColor Green
