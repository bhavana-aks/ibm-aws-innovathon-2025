# Comprehensive Architecture Flow

```mermaid
flowchart TD
    %% Styling
    classDef aws fill=#FF9900,stroke=#232F3E,color=black,stroke-width:2px;
    classDef client fill=#61DAFB,stroke=#20232A,color=black,stroke-width:2px;
    classDef compute fill=#D05C47,stroke=#232F3E,color=white,stroke-width:2px;
    classDef db fill=#3B48CC,stroke=#232F3E,color=white,stroke-width:2px;
    classDef storage fill=#27A327,stroke=#232F3E,color=white,stroke-width:2px;
    classDef ai fill=#8C4FFF,stroke=#232F3E,color=white,stroke-width:2px;

    %% Client Layer
    subgraph Client_Layer [User / Client]
        User([User Browser])
        class User client
    end

    %% Authentication
    subgraph Auth_Layer [Authentication & Security]
        Cognito(AWS Cognito<br/>User Pools & Identity)
        class Cognito aws
    end

    %% Frontend Hosting
    subgraph Frontend_Hosting [AWS Amplify]
        AmplifyHosting[AWS Amplify Hosting]
        NextApp(Next.js App Router<br/>SSR & Client Components)
        class AmplifyHosting aws
        class NextApp compute
    end

    %% Backend API Layer
    subgraph API_Layer [Next.js API Routes / Backend]
        API_Auth[Middleware & Auth]
        API_Projects[POST /api/projects<br/>Create Project]
        API_Generate[POST /api/generate<br/>Generate Script]
        API_Audio[POST /api/audio<br/>Generate Audio]
        API_Video[POST /api/video<br/>Trigger Rendering]
        API_Files[GET /api/files<br/>List/Upload Files]
        
        Lambda_ListFiles(Lambda: list-files<br/>Tenant Isolated Listing)
        class Lambda_ListFiles aws
    end
    class API_Auth,API_Projects,API_Generate,API_Audio,API_Video,API_Files compute

    %% Data & Storage
    subgraph Data_Layer [Data Persistence]
        DDB[(Amazon DynamoDB<br/>Single Table Design)]
        S3_Input[(S3 Bucket<br/>Input: Scripts, PDFs, Audio)]
        S3_Output[(S3 Bucket<br/>Output: MP4 Videos)]
        class DDB db
        class S3_Input,S3_Output storage
    end

    %% AI Services
    subgraph AI_Layer [AI Processing]
        Bedrock(AWS Bedrock<br/>Claude 3 Sonnet)
        Polly(Amazon Polly<br/>Text-to-Speech)
        class Bedrock,Polly ai
    end

    %% Heavy Compute
    subgraph Compute_Layer [Video Processing]
        ECR(Amazon ECR<br/>Container Registry)
        ECS_Cluster[AWS ECS Cluster]
        Fargate_Task[Fargate Task<br/>Container: video-saas-recorder]
        
        subgraph Container [Container Internals]
            Playwright[Playwright Browser]
            FFmpeg[FFmpeg Processing]
            Xvfb[Xvfb Virtual Display]
        end
        
        class ECS_Cluster,Fargate_Task,ECR aws
        class Playwright,FFmpeg,Xvfb compute
    end

    %% Relationships

    %% Hosting
    AmplifyHosting -- 0. Serves App --> NextApp

    %% Auth Flow
    User -- 1. Sign Up / Login --> Cognito
    User -- 2. Authenticated Request --> NextApp
    NextApp -- 3. Verify Token --> Cognito

    %% Project & File Flow
    NextApp -- 4. Create Project --> API_Projects
    API_Projects -- 5. Save Metadata --> DDB
    
    NextApp -- 6. Upload Guide/Script --> S3_Input
    API_Projects -- 7. Reference S3 Key --> DDB

    %% File Listing (Lambda)
    NextApp -- 8. List Files --> Lambda_ListFiles
    Lambda_ListFiles -- 9. Query by Tenant --> DDB

    %% Script Generation Flow (Bedrock)
    NextApp -- 10. Generate Script --> API_Generate
    API_Generate -- 11. Read Docs/Script --> S3_Input
    API_Generate -- 12. Invoke Model --> Bedrock
    Bedrock -- 13. Return JSON Manifest --> API_Generate
    API_Generate -- 14. Save Manifest --> DDB

    %% Audio Generation Flow (Polly)
    NextApp -- 15. Generate Audio --> API_Audio
    API_Audio -- 16. Read Text --> DDB
    API_Audio -- 17. Synthesize Speech --> Polly
    Polly -- 18. Return Audio Stream --> API_Audio
    API_Audio -- 19. Save MP3 --> S3_Input

    %% Video Rendering Flow
    NextApp -- 20. Generate Video --> API_Video
    API_Video -- 21. RunTask --> ECS_Cluster
    ECR -- 22. Pull Image --> Fargate_Task
    ECS_Cluster -- 23. Launch --> Fargate_Task
    
    Fargate_Task -- 24. Fetch Manifest/Assets/Audio --> S3_Input
    Fargate_Task -- 25. Update Status --> DDB
    Fargate_Task -- 26. Execute Actions --> Playwright
    Playwright -- 27. Capture Frames --> FFmpeg
    FFmpeg -- 28. Encode Video --> S3_Output
    Fargate_Task -- 29. Upload Final MP4 --> S3_Output
    Fargate_Task -- 30. Mark Complete --> DDB

    %% Playback
    User -- 31. Watch Video --> NextApp
    NextApp -- 32. Get Signed URL --> S3_Output
```

## Flow Description

1.  **Authentication**: Users authenticate via **AWS Cognito**. A unique Tenant ID is assigned and used for data isolation.
2.  **Project Setup**: Users upload Playwright scripts and PDF guides to **S3**. Metadata is stored in **DynamoDB**.
3.  **Script Generation**: **AWS Bedrock** (Claude 3 Sonnet) analyzes uploaded content to generate a narrated script manifest.
4.  **Audio Generation**: **Amazon Polly** converts the script's narration text into MP3 audio files, which are stored in **S3**.
5.  **Video Rendering**:
    *   **AWS ECS Fargate** pulls the recording container image from **Amazon ECR**.
    *   The task runs **Playwright** (browser automation) and **FFmpeg** (video encoding) in a headless **Xvfb** environment.
    *   It syncs the actions with the pre-generated audio files.
6.  **Output**: The final MP4 video is uploaded to **S3** for user playback.
7.  **Playback**: User streams the video via the application.

## Technology Stack

### Cloud Infrastructure (AWS)
*   **Hosting**: AWS Amplify Hosting (CI/CD, Domain management)
*   **Authentication**: AWS Cognito (User Pools, Identity)
*   **Database**: Amazon DynamoDB (Single Table Design)
*   **Storage**: Amazon S3 (Assets, Artifacts, Media)
*   **Compute**:
    *   **AWS ECS Fargate**: Serverless container execution for video rendering
    *   **AWS Lambda**: Serverless functions for specific utility tasks
*   **AI & ML**:
    *   **AWS Bedrock**: Foundation Models (Claude 3 Sonnet) for script generation
    *   **Amazon Polly**: Neural Text-to-Speech for narration
*   **Container Registry**: Amazon ECR

### Frontend
*   **Framework**: Next.js 16 (App Router)
*   **Language**: TypeScript
*   **UI Library**: React 19
*   **Styling**: Tailwind CSS 4
*   **State/Data**: React Server Components (RSC), Server Actions

### Video Processing Engine
*   **Runtime**: Node.js
*   **Browser Automation**: Playwright (v1.49.0)
*   **Video Encoding**: FFmpeg
*   **Display Server**: Xvfb (Headless execution)
*   **Base Image**: `mcr.microsoft.com/playwright:v1.49.0-jammy`

### Development & DevOps
*   **Infrastructure as Code**: PowerShell / AWS CLI scripts
*   **Containerization**: Docker
*   **Documentation**: Mermaid.js (Diagrams)
