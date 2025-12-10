# Video SaaS Platform - Tracer Bullet Implementation Plan

## Overview
This plan follows the **Tracer Bullet Strategy**: build a minimal end-to-end flow first, then iterate and refine. The goal is to get a working system from user upload → video generation → playback as quickly as possible, then enhance each component.

---

## Phase 0: Initial Setup & Dependencies

### Prerequisites Checklist

#### 1. Development Environment
- [ ] **Git** (v2.30+)
  - Verify: `git --version`
  - Configure: `git config --global user.name "Your Name"` and `git config --global user.email "your.email@example.com"`
  
- [ ] **Node.js** (v20.x LTS)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify: `node --version` and `npm --version`
  
- [ ] **AWS CLI** (v2.15+)
  - Install: Follow [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  - Configure: `aws configure` (requires AWS Access Key ID, Secret Access Key, region, output format)
  - Verify: `aws --version` and `aws sts get-caller-identity`
  
- [ ] **Docker** (v24+)
  - Install: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux)
  - Verify: `docker --version` and `docker ps`
  
- [ ] **Terraform** (v1.6+) - Optional but recommended for infrastructure
  - Download from [terraform.io](https://www.terraform.io/downloads)
  - Verify: `terraform --version`

#### 2. AWS Account Setup
- [ ] **AWS Account** with billing enabled
- [ ] **IAM User** with programmatic access (or use AWS SSO)
  - Required permissions: CloudFormation, IAM, Cognito, DynamoDB, S3, Lambda, Step Functions, Bedrock, Polly, ECS, VPC, CloudFront, API Gateway
  - Recommended: Create a dedicated IAM user/role for development with admin permissions (restrict in production)
  
- [ ] **AWS Region Selection**
  - Choose a region that supports all services (Bedrock availability varies)
  - Recommended: `us-east-1` or `us-west-2`
  - Set default: `aws configure set region <your-region>`

#### 3. AWS Service Prerequisites
- [ ] **Bedrock Model Access**
  - Request access to Claude 3.5 Sonnet in AWS Bedrock console
  - Navigate: AWS Console → Bedrock → Model access → Request access
  - This can take 24-48 hours for approval
  
- [ ] **S3 Bucket** (will be created in Phase 1, but plan naming)
  - Naming convention: `video-saas-<region>-<account-id>-<env>`
  - Example: `video-saas-us-east-1-123456789-dev`

#### 4. Development Tools (Optional but Recommended)
- [ ] **VS Code** or **Cursor** with extensions:
  - AWS Toolkit
  - Terraform
  - ESLint/Prettier
  - TypeScript
  
- [ ] **Postman** or **Insomnia** (for API testing)
  
- [ ] **AWS SAM CLI** (for local Lambda testing) - Optional

---

## Tracer Bullet Phases

### Phase 1: Foundation & Data Layer (Week 1)
**Goal**: Set up core infrastructure and data persistence. Get a file upload working.

#### Step 1.1: Project Structure
```
innovathon/
├── frontend/              # Next.js app
│   ├── app/
│   ├── components/
│   └── package.json
├── backend/               # Lambda functions & Step Functions
│   ├── lambdas/
│   │   ├── file-upload/
│   │   ├── script-generator/
│   │   └── audio-generator/
│   ├── step-functions/
│   └── infrastructure/    # CDK/Terraform
├── fargate/              # Docker container for video recording
│   ├── Dockerfile
│   └── src/
├── docs/                 # Documentation
└── scripts/              # Deployment scripts
```

#### Step 1.2: DynamoDB Table Creation
- Create `VideoSaaS` table with:
  - Partition Key: `PK` (String)
  - Sort Key: `SK` (String)
  - Enable Point-in-Time Recovery
  - Set up GSI if needed for queries
- Test with sample data:
  - `TENANT#101` / `FILE#doc_a` (PDF)
  - `TENANT#101` / `PROJ#proj_1` (Project)

#### Step 1.3: S3 Bucket Setup
- Create bucket with versioning enabled
- Set up folder structure:
  - `lib/` - Asset library files
  - `audio/` - Generated MP3s
  - `videos/` - Final renders
- Configure CORS for frontend access
- Set up bucket policies for ABAC (will be enhanced in Phase 2)

#### Step 1.4: Basic Frontend Scaffold
- Initialize Next.js 14+ with App Router
- Set up Tailwind CSS + Shadcn UI
- Create basic layout with:
  - Header
  - Sidebar navigation
  - Main content area
- No auth yet (mock tenant ID)

#### Step 1.5: File Upload (Tracer Bullet)
- Create simple upload form (no drag-drop yet)
- Upload directly to S3 (presigned URL or direct)
- Save metadata to DynamoDB
- Display uploaded files in a list
- **Success Criteria**: Upload a PDF, see it in the list

---

### Phase 2: Authentication & Multi-Tenancy (Week 1-2)
**Goal**: Secure the system with Cognito and enforce tenant isolation.

#### Step 2.1: Cognito User Pool Setup
- Create Cognito User Pool
- Configure:
  - Sign-in options (email)
  - Password policy
  - MFA (optional for MVP)
- Create User Pool Client
- Set up custom attributes: `tenant_id`

#### Step 2.2: Frontend Auth Integration
- Install `@aws-amplify/auth` or `aws-amplify`
- Create login/signup pages
- Implement auth context/provider
- Protect routes with middleware
- Extract `tenant_id` from Cognito token

#### Step 2.3: API Gateway + Lambda (Basic)
- Create API Gateway REST API
- Create Lambda function for file listing
- Implement tenant filtering in DynamoDB queries
- Connect frontend to API
- **Success Criteria**: Login, see only your files

#### Step 2.4: IAM & ABAC Setup
- Create IAM roles for Lambda functions
- Set up S3 bucket policies with `aws:PrincipalTag` conditions
- Tag Cognito users with `tenant_id`
- Test tenant isolation

---

### Phase 3: Project Creation & Script Generation (Week 2-3)
**Goal**: User can create a project, select files, and generate a draft script.

#### Step 3.1: Project Creation UI
- Build "New Project" modal
- File selection component (multi-select from library)
- Drag-and-drop ordering
- Prompt input textarea
- "Draft Script" button

#### Step 3.2: Step Functions Workflow (Basic)
- Create Step Functions state machine:
  ```
  Start → Merge Files → Generate Script → Wait for User → End
  ```
- Implement "Wait for Task Token" pattern for user editing
- Basic error handling

#### Step 3.3: Lambda: File Merger
- Read selected files from S3
- Extract PDF text (use Textract or simple PDF parser for MVP)
- Extract Playwright code
- Combine into context object
- Pass to next step

#### Step 3.4: Lambda: Script Generator (Bedrock)
- Invoke Bedrock with Claude 3.5 Sonnet
- Use the "Mega-Prompt" from context.md
- Parse JSON manifest response
- Save to DynamoDB (Project record)
- Return manifest to frontend

#### Step 3.5: Script Editor UI
- Display generated script as editable cards
- Each card shows: step_id, narration text, code_action
- Allow text editing
- "Approve & Render" button
- **Success Criteria**: Create project, see generated script, edit it

---

### Phase 4: Audio Generation & Synchronization (Week 3-4)
**Goal**: Generate audio files and measure durations for sync.

#### Step 4.1: Step Functions Map State
- Add Map state to workflow
- Iterate over approved manifest steps
- Parallel execution (up to 20 concurrent)

#### Step 4.2: Lambda: Audio Generator
- Invoke Amazon Polly for each narration text
- Save MP3 to S3 (`audio/{project_id}/step_{id}.mp3`)
- Use `ffprobe` or `soxi` to measure duration
- Return duration metadata
- Handle errors gracefully

#### Step 4.3: Lambda: Duration Aggregator
- Collect all audio durations
- Create duration map: `{ step_id: duration_ms }`
- Pass to next step

#### Step 4.4: Lambda: Script Synchronizer (Bedrock)
- Take original Playwright code
- Take duration map
- Use Bedrock to inject `waitForTimeout` calls
- Generate `synced_runner.ts`
- Save to S3
- **Success Criteria**: Generate 5 audio files, get synced script

---

### Phase 5: Video Recording (Week 4-5)
**Goal**: Record the browser session with synchronized audio.

#### Step 5.1: Docker Container Setup
- Create Dockerfile with:
  - Node.js base image
  - Playwright with Chromium
  - FFmpeg
  - PulseAudio (for audio playback)
  - AWS CLI (for S3 access)
- Test locally: `docker build` and `docker run`

#### Step 5.2: Fargate Task Definition
- Create ECS Task Definition
- Configure:
  - Container image
  - Environment variables (S3 paths, project ID)
  - IAM role for S3 access
  - Resource limits (CPU/Memory)
  - Logging to CloudWatch

#### Step 5.3: Lambda: Video Recorder Orchestrator
- Download synced script and MP3s from S3
- Launch Fargate task
- Pass task token for callback
- Monitor task status

#### Step 5.4: Fargate Container Script
- Download files from S3
- Start PulseAudio daemon
- Run Playwright script (which plays MP3s)
- Capture screen with FFmpeg
- Upload raw video to S3
- Call Step Functions callback
- **Success Criteria**: Generate a 30-second video

#### Step 5.5: VPC & Networking
- Create VPC with private subnets
- Set up VPC endpoints for S3 (no internet needed)
- Configure Fargate to run in private subnets
- Security groups (minimal access)

---

### Phase 6: Post-Processing & Delivery (Week 5)
**Goal**: Finalize video and deliver to user.

#### Step 6.1: Lambda: Video Post-Processor
- Download raw video from S3
- Optional: Add background music (if requested)
- Optional: Add intro/outro
- Use FFmpeg to finalize
- Upload to S3 (`videos/{project_id}/final.mp4`)

#### Step 6.2: CloudFront Distribution
- Create CloudFront distribution
- Origin: S3 bucket
- Configure signed URLs (for security)
- Set up caching rules

#### Step 6.3: Video Player UI
- Display video in frontend
- Use HTML5 video player or video.js
- Show project status (Draft → Rendering → Complete)
- **Success Criteria**: Watch the generated video

---

### Phase 7: Polish & Production Readiness (Week 6+)
**Goal**: Enhance UX, add error handling, optimize costs.

#### Step 7.1: Error Handling
- Add retry logic in Step Functions
- Error notifications (SNS/SES)
- User-facing error messages
- Dead letter queues for failed tasks

#### Step 7.2: Cost Optimization
- Use Fargate Spot for video rendering
- Implement S3 lifecycle policies (delete old temp files)
- Add CloudWatch alarms for cost monitoring
- Optimize Bedrock token usage

#### Step 7.3: UI/UX Enhancements
- Loading states and progress indicators
- Drag-and-drop file upload
- Project templates
- Video preview thumbnails
- Export options

#### Step 7.4: Monitoring & Observability
- CloudWatch dashboards
- X-Ray tracing (optional)
- Application logs
- Performance metrics

#### Step 7.5: Testing
- Unit tests for Lambda functions
- Integration tests for Step Functions
- E2E tests for critical flows
- Load testing (optional)

---

## Implementation Order Summary

### Tracer Bullet Path (Minimum Viable Flow)
1. **Week 1**: Phase 1 (Foundation) + Phase 2 (Auth) - Basic upload and login
2. **Week 2**: Phase 3 (Project Creation) - Create project, generate script
3. **Week 3**: Phase 4 (Audio) - Generate audio files
4. **Week 4**: Phase 5 (Video) - Record video (simplified: skip sync initially)
5. **Week 5**: Phase 6 (Delivery) - Show video in UI

### Refinement Path (After Tracer Bullet Works)
- Add synchronization (Phase 4.4)
- Add post-processing (Phase 6.1)
- Add CloudFront (Phase 6.2)
- Polish and optimize (Phase 7)

---

## Key Decisions & Trade-offs

### MVP Simplifications
1. **Skip Textract initially**: Use simple PDF parser, add Textract later
2. **Skip VPC initially**: Run Fargate in public subnet for MVP, secure later
3. **Skip CloudFront initially**: Serve videos directly from S3
4. **Skip post-processing initially**: Use raw video output
5. **Manual testing**: Skip automated tests for MVP, add later

### Critical Path Dependencies
- **Bedrock access**: Must be approved before Phase 3
- **Docker container**: Must work locally before Phase 5
- **Step Functions**: Core orchestration, implement early
- **Cognito**: Needed for Phase 2, blocks everything after

---

## Risk Mitigation

### High-Risk Items
1. **Bedrock Access Delay**: Request immediately, have fallback plan (local LLM or different model)
2. **Fargate Container Issues**: Test Docker image extensively locally
3. **Audio Sync Complexity**: Start with fixed delays, refine with measurement later
4. **Cost Overruns**: Set up billing alerts, use Spot instances

### Validation Checkpoints
- After Phase 1: Can upload and list files
- After Phase 2: Can login and see tenant isolation
- After Phase 3: Can generate a script (even if imperfect)
- After Phase 4: Can generate audio files
- After Phase 5: Can record a video (even if not synced)
- After Phase 6: Can watch the video end-to-end

---

## Next Steps

1. **Review this plan** and adjust timeline based on team size
2. **Set up development environment** (Phase 0)
3. **Request Bedrock access** immediately (can take 24-48 hours)
4. **Initialize Git repository** and create project structure
5. **Start with Phase 1, Step 1.1** (Project Structure)

---

## Notes

- Each phase should be **independently testable**
- **Commit frequently** with meaningful messages
- **Document decisions** in code comments or ADRs (Architecture Decision Records)
- **Keep infrastructure as code** (Terraform/CDK) from the start
- **Use feature flags** for gradual rollouts



