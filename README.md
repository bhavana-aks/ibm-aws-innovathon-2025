# Video SaaS Platform

A platform for generating synchronized video tutorials from PDF guides and Playwright test scripts.

## Project Structure

```
innovathon/
├── frontend/              # Next.js application
├── backend/               # Lambda functions & Step Functions
│   ├── lambdas/
│   ├── step-functions/
│   └── infrastructure/    # Infrastructure scripts
├── fargate/              # Docker container for video recording
├── docs/                 # Documentation
└── scripts/              # Deployment scripts
```

## Phase 1: Foundation & Data Layer

### Prerequisites

- AWS CLI configured with credentials
- Node.js 20.x (currently using 18.x - upgrade recommended)
- DynamoDB table created
- S3 bucket created

### Setup Instructions

1. **Create DynamoDB Table**
   ```powershell
   cd backend/infrastructure
   .\create-dynamodb-table.ps1
   ```

2. **Create S3 Bucket**
   ```powershell
   cd backend/infrastructure
   .\create-s3-bucket.ps1
   ```
   Note the bucket name from the output.

3. **Configure Frontend Environment Variables**
   ```powershell
   cd frontend
   copy .env.local.example .env.local
   ```
   Edit `.env.local` and add:
   - Your AWS credentials
   - The S3 bucket name from step 2
   - AWS region

4. **Run Frontend Development Server**
   ```powershell
   cd frontend
   npm run dev
   ```

5. **Test File Upload**
   - Open http://localhost:3000
   - Upload a PDF or TypeScript file
   - Verify it appears in the uploaded files list

### Success Criteria

✅ Upload a PDF file  
✅ See it in the uploaded files list  
✅ File metadata saved to DynamoDB  
✅ File stored in S3 bucket

## Next Steps

- Phase 2: Authentication & Multi-Tenancy
- Phase 3: Project Creation & Script Generation

## Notes

- Currently using mock tenant ID (`TENANT#101`) for MVP
- Node.js version warning: Upgrade to Node 20.x for full Next.js 16 compatibility
- AWS credentials should be stored securely (use AWS IAM roles in production)






