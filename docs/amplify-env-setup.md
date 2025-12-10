# Amplify Environment Variables Setup Guide

## Overview

AWS Amplify Hosting for Next.js SSR apps requires specific configuration to expose environment variables to server-side code (API routes). This guide explains how to properly configure environment variables.

## Required Environment Variables

Set these variables in the Amplify Console under **App settings > Environment variables**:

### Core AWS Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_AWS_REGION` | AWS region for services | `us-east-1` |
| `APP_AWS_ACCESS_KEY_ID` | AWS access key (optional if using IAM role) | - |
| `APP_AWS_SECRET_ACCESS_KEY` | AWS secret key (optional if using IAM role) | - |

### Database & Storage

| Variable | Description | Example |
|----------|-------------|---------|
| `S3_BUCKET_NAME` | S3 bucket for file storage | `video-saas-us-east-1-123456789-dev` |
| `DYNAMODB_TABLE_NAME` | DynamoDB table name | `VideoSaaS` |

### ECS Configuration (Phase 5)

| Variable | Description | Example |
|----------|-------------|---------|
| `ECS_CLUSTER_NAME` | ECS cluster name | `video-saas-cluster` |
| `ECS_TASK_FAMILY` | ECS task definition family | `video-saas-recorder` |
| `ECS_SUBNETS` | Comma-separated subnet IDs | `subnet-xxx,subnet-yyy` |
| `ECS_SECURITY_GROUPS` | Comma-separated security group IDs | `sg-xxx` |

### Public Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_BASE_URL` | Application base URL | `https://main.xxxxx.amplifyapp.com` |
| `NEXT_PUBLIC_AWS_REGION` | Public AWS region | `us-east-1` |

## Configuration Steps

### Step 1: Set Variables in Amplify Console

1. Go to AWS Amplify Console
2. Select your app
3. Go to **App settings > Environment variables**
4. Add each variable listed above

### Step 2: Configure IAM Role (Recommended)

Instead of using explicit credentials, configure the Amplify service role to have proper permissions:

1. Go to **App settings > General**
2. Find the **Service role** and click to edit
3. Attach policies for:
   - `AmazonDynamoDBFullAccess` (or a custom policy)
   - `AmazonS3FullAccess` (or a custom policy)
   - `AmazonECS_FullAccess` (if using ECS)
   - `AmazonPollyFullAccess` (for TTS)
   - `AmazonBedrockFullAccess` (for AI generation)

### Step 3: Verify amplify.yml Configuration

Ensure your `amplify.yml` includes the `serverSideEnvironmentVariables` section:

```yaml
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
      serverSideEnvironmentVariables:
        APP_AWS_REGION: ${APP_AWS_REGION}
        APP_AWS_ACCESS_KEY_ID: ${APP_AWS_ACCESS_KEY_ID}
        APP_AWS_SECRET_ACCESS_KEY: ${APP_AWS_SECRET_ACCESS_KEY}
        S3_BUCKET_NAME: ${S3_BUCKET_NAME}
        DYNAMODB_TABLE_NAME: ${DYNAMODB_TABLE_NAME}
        ECS_CLUSTER_NAME: ${ECS_CLUSTER_NAME}
        ECS_TASK_FAMILY: ${ECS_TASK_FAMILY}
        ECS_SUBNETS: ${ECS_SUBNETS}
        ECS_SECURITY_GROUPS: ${ECS_SECURITY_GROUPS}
        NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL}
```

## Troubleshooting

### Error: "CredentialsProviderError: Could not load credentials from any providers"

**Cause**: AWS SDK cannot find valid credentials.

**Solutions**:
1. Verify environment variables are set in Amplify Console
2. Check that the Amplify service role has required IAM permissions
3. Ensure `serverSideEnvironmentVariables` is configured in `amplify.yml`

### Error: "S3_BUCKET_NAME environment variable is not set"

**Cause**: Server-side environment variables not exposed.

**Solutions**:
1. Add the variable to `serverSideEnvironmentVariables` in `amplify.yml`
2. Redeploy the application after updating `amplify.yml`

### Debug: Check Environment Variables

Add this debug route temporarily to verify variables are accessible:

```typescript
// app/api/debug/route.ts (REMOVE IN PRODUCTION)
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    region: process.env.APP_AWS_REGION || 'NOT_SET',
    bucket: process.env.S3_BUCKET_NAME ? 'SET' : 'NOT_SET',
    table: process.env.DYNAMODB_TABLE_NAME || 'NOT_SET',
    hasCredentials: !!(process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY),
  });
}
```

## Using IAM Role vs Explicit Credentials

### Option A: IAM Role (Recommended for Production)

- Don't set `APP_AWS_ACCESS_KEY_ID` and `APP_AWS_SECRET_ACCESS_KEY`
- Configure the Amplify service role with required permissions
- More secure, no credential rotation needed

### Option B: Explicit Credentials (For Development/Testing)

- Set both `APP_AWS_ACCESS_KEY_ID` and `APP_AWS_SECRET_ACCESS_KEY`
- Use IAM user credentials with required permissions
- Requires credential rotation for security

## After Configuration

1. Trigger a new deployment in Amplify
2. Monitor CloudWatch logs for the debug output
3. Verify API routes are working correctly

