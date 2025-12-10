// 07-12-25: Added Phase 5 video recording types
// 07-12-25: Added Phase 4 audio generation types
// 07-12-25: Created project types for Phase 3

export interface FileItem {
  id: string;
  name: string;
  type: 'pdf' | 'playwright' | 'other';
  s3Key: string;
  uploadedAt: string;
}

export interface ScriptStep {
  step_id: number;
  code_action: string;
  narration: string;
  importance: 'low' | 'medium' | 'high';
}

export interface AudioStep extends ScriptStep {
  audioS3Key?: string;
  durationMs?: number;
  audioGenerated?: boolean;
}

export interface AudioDurationMap {
  [stepId: number]: number; // step_id -> duration in ms
}

export interface VideoProgress {
  stage: 'STARTING' | 'RUNNING' | 'PROCESSING' | 'UPLOADING' | 'COMPLETE' | 'ERROR';
  taskArn?: string;
  startedAt?: string;
  completedAt?: string;
  mock?: boolean;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  status: 'DRAFT' | 'GENERATING' | 'REVIEW' | 'APPROVED' | 'AUDIO_GENERATING' | 'AUDIO_COMPLETE' | 'SYNCING' | 'RENDERING' | 'VIDEO_GENERATING' | 'COMPLETE' | 'ERROR';
  userPrompt: string;
  selectedFiles: string[]; // File IDs
  manifest?: AudioStep[];
  audioProgress?: {
    total: number;
    completed: number;
    currentStep?: number;
  };
  durationMap?: AudioDurationMap;
  syncedScriptS3Key?: string; // S3 key for synced_runner.ts
  videoS3Key?: string; // S3 key for final video
  videoProgress?: VideoProgress;
  taskToken?: string; // Step Functions task token for approval
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface CreateProjectRequest {
  name: string;
  userPrompt: string;
  selectedFiles: string[];
}

export interface ApproveScriptRequest {
  projectId: string;
  manifest: ScriptStep[];
}

export interface GenerateAudioRequest {
  projectId: string;
  voiceId?: string; // Amazon Polly voice ID (default: Matthew)
}

export interface AudioGenerationResult {
  stepId: number;
  audioS3Key: string;
  durationMs: number;
}

export interface StartVideoRecordingRequest {
  projectId: string;
  useSimpleRecording?: boolean; // Use Playwright's built-in recording vs FFmpeg
}

export interface VideoStatusResponse {
  status: string;
  videoS3Key?: string;
  videoUrl?: string;
  videoProgress?: VideoProgress;
  taskStatus?: {
    lastStatus: string;
    desiredStatus: string;
    stoppedReason?: string;
    stoppedAt?: string;
  };
}
