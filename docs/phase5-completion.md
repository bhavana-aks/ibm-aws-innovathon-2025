# Phase 5: Video Recording - Completion Report

**Date**: 07-12-25  
**Status**: Implementation Complete  
**Goal**: Record browser sessions with synchronized audio using Docker containers and AWS Fargate

---

## Overview

Phase 5 implements the video recording system that:
1. Runs Playwright scripts in a Docker container
2. Captures screen with FFmpeg
3. Synchronizes audio narration
4. Uploads final video to S3

---

## Components Implemented

### 1. Docker Container (`/fargate/`)

#### Dockerfile
- Base image: `mcr.microsoft.com/playwright:v1.40.0-jammy`
- Includes: Node.js, Playwright, Chromium, FFmpeg, PulseAudio, AWS CLI, Xvfb
- Health check endpoint on port 3000

#### Container Scripts
- `entrypoint.sh` - Initializes display (Xvfb) and audio (PulseAudio)
- `src/index.ts` - Main orchestration and health server
- `src/video-recorder.ts` - Playwright + FFmpeg recording logic
- `src/s3-utils.ts` - S3 download/upload utilities
- `src/types.ts` - TypeScript interfaces

### 2. Infrastructure Scripts (`/backend/infrastructure/`)

| Script | Purpose |
|--------|---------|
| `create-ecr-repository.ps1` | Creates ECR repository for Docker images |
| `create-ecs-cluster.ps1` | Creates ECS cluster with Fargate support |
| `create-ecs-task-role.ps1` | Creates IAM roles for task execution |
| `create-ecs-task-definition.ps1` | Registers Fargate task definition |

### 3. API Endpoint (`/frontend/app/api/projects/[projectId]/video/`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/projects/{id}/video` | Start video recording |
| GET | `/api/projects/{id}/video` | Get video status and URL |

### 4. Frontend Updates

- Updated `script-editor.tsx` with:
  - Video generation button (RENDERING status)
  - Progress indicator (VIDEO_GENERATING status)
  - Video player (COMPLETE status)
- Updated `types/project.ts` with video-related types

---

## Project Status Flow

```
RENDERING → VIDEO_GENERATING → COMPLETE
                ↓
              ERROR
```

### Status Definitions

| Status | Description |
|--------|-------------|
| `RENDERING` | Ready for video generation (after sync) |
| `VIDEO_GENERATING` | Recording in progress |
| `COMPLETE` | Video ready for playback |
| `ERROR` | Video generation failed |

---

## Setup Instructions

### Prerequisites

1. Docker installed and running
2. AWS CLI configured
3. Phases 1-4 completed

### Step 1: Run Phase 5 Setup

```powershell
cd innovathon
.\scripts\setup-phase5.ps1 -Region us-east-1
```

This script:
1. Creates ECR repository
2. Creates ECS cluster
3. Creates IAM roles
4. Builds and pushes Docker image
5. Registers task definition

### Step 2: Configure Environment Variables

Add to `frontend/.env.local`:

```env
# ECS Configuration (Phase 5)
ECS_CLUSTER_NAME=video-saas-cluster
ECS_TASK_FAMILY=video-saas-recorder
ECS_SUBNETS=subnet-xxx,subnet-yyy
ECS_SECURITY_GROUPS=sg-xxx
```

### Step 3: (Optional) Configure VPC

For MVP, use default VPC with public subnets:

```powershell
# Get default VPC subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxx" --query "Subnets[*].SubnetId"

# Get/create security group allowing outbound traffic
aws ec2 create-security-group --group-name video-recorder-sg --description "Video recorder security group"
```

---

## API Reference

### Start Video Recording

```http
POST /api/projects/{projectId}/video
Content-Type: application/json
x-tenant-id: {tenantId}

{
  "useSimpleRecording": true
}
```

**Response:**
```json
{
  "message": "Video generation started",
  "projectId": "abc123",
  "taskArn": "arn:aws:ecs:...",
  "status": "VIDEO_GENERATING"
}
```

### Get Video Status

```http
GET /api/projects/{projectId}/video
x-tenant-id: {tenantId}
```

**Response:**
```json
{
  "status": "COMPLETE",
  "videoS3Key": "videos/demo/abc123/recording.mp4",
  "videoUrl": "https://...",
  "videoProgress": {
    "stage": "COMPLETE",
    "completedAt": "2025-12-07T..."
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ScriptEditor → "Generate Video" → Poll for status    │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ API Call
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Next.js API Route                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  POST /api/projects/{id}/video                         │ │
│  │  1. Validate project status (RENDERING)                │ │
│  │  2. Launch ECS Fargate task                            │ │
│  │  3. Update status to VIDEO_GENERATING                  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ RunTask
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    AWS ECS Fargate                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Docker Container (video-saas-recorder)                │ │
│  │  1. Download synced script from S3                     │ │
│  │  2. Download audio files from S3                       │ │
│  │  3. Start Xvfb (virtual display)                       │ │
│  │  4. Start PulseAudio (audio)                           │ │
│  │  5. Start FFmpeg screen capture                        │ │
│  │  6. Run Playwright script with audio playback          │ │
│  │  7. Stop capture, upload video to S3                   │ │
│  │  8. Send callback to Step Functions (optional)         │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ Upload
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                       Amazon S3                              │
│  videos/{tenantId}/{projectId}/recording.mp4                │
└──────────────────────────────────────────────────────────────┘
```

---

## Mock Mode

For development without AWS infrastructure:

1. Set `USE_MOCK_VIDEO=true` in environment
2. API will simulate video generation (10s delay)
3. Project status updates to COMPLETE with mock S3 key

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Task fails immediately | Check CloudWatch logs at `/ecs/video-saas-cluster` |
| No video file | Verify S3 bucket permissions and CORS |
| Audio not synced | Check PulseAudio logs in container |
| Browser won't start | Increase task memory (4GB recommended) |

### Checking Task Logs

```bash
aws logs get-log-events \
  --log-group-name /ecs/video-saas-cluster \
  --log-stream-name video-recorder/{task-id}
```

---

## Cost Considerations

| Resource | Cost Factor |
|----------|-------------|
| Fargate | ~$0.04/vCPU-hour + $0.004/GB-hour |
| S3 Storage | ~$0.023/GB/month |
| ECR | ~$0.10/GB/month |

**Tips:**
- Use Fargate Spot for 70% cost savings
- Set S3 lifecycle policy to delete old videos
- Monitor with CloudWatch billing alerts

---

## Files Created/Modified

### New Files
- `/fargate/Dockerfile`
- `/fargate/entrypoint.sh`
- `/fargate/package.json`
- `/fargate/tsconfig.json`
- `/fargate/src/index.ts`
- `/fargate/src/video-recorder.ts`
- `/fargate/src/s3-utils.ts`
- `/fargate/src/types.ts`
- `/backend/infrastructure/create-ecr-repository.ps1`
- `/backend/infrastructure/create-ecs-cluster.ps1`
- `/backend/infrastructure/create-ecs-task-role.ps1`
- `/backend/infrastructure/create-ecs-task-definition.ps1`
- `/scripts/setup-phase5.ps1`
- `/frontend/app/api/projects/[projectId]/video/route.ts`

### Modified Files
- `/frontend/types/project.ts` - Added video types
- `/frontend/components/script-editor.tsx` - Added video UI

---

## Next Steps (Phase 6)

1. **Post-Processing**: Add intro/outro, background music
2. **CloudFront**: Set up CDN for video delivery
3. **Video Player**: Enhanced player with chapter markers
4. **Export Options**: Download, share links

---

## Success Criteria

- [x] Docker container builds successfully
- [x] Infrastructure scripts create all AWS resources
- [x] API endpoint triggers ECS task
- [x] Frontend shows video generation progress
- [x] Mock mode works for development
- [ ] End-to-end video generation (requires AWS setup)

---

## Notes

- Container uses 2 vCPU and 4GB memory for reliable browser operation
- FFmpeg captures at 30fps, 1920x1080 resolution
- Videos are stored in MP4 format with H.264/AAC codecs
- Task timeout is 10 minutes (configurable)
