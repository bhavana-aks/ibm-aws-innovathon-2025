// 08-12-25: Add StepTiming interface for post-recording audio muxing
// 08-12-25: Add audio playback toggle and local video path
// 07-12-25: Created types for video recording container
// Phase 5: Video Recording Types

export interface VideoRecordingConfig {
  projectId: string;
  tenantId: string;
  s3Bucket: string;
  syncedScriptS3Key: string;
  audioS3Prefix: string;
  outputVideoS3Key: string;
  taskToken?: string;
  width: number;
  height: number;
  fps: number;
  enableAudioPlayback?: boolean;
}

export interface ManifestStep {
  step_id: number;
  code_action: string;
  narration: string;
  importance: 'low' | 'medium' | 'high';
  audioS3Key?: string;
  durationMs?: number;
  audioGenerated?: boolean;
}

/**
 * Timing information for each step during video recording
 * Used for post-recording audio muxing at correct timestamps
 */
export interface StepTiming {
  stepId: number;
  startTimestamp: number;  // ms from video start
  endTimestamp: number;    // ms from video start  
  actionDuration: number;  // actual time the action took
  audioDuration: number;   // expected audio duration from manifest
}

export interface RecordingResult {
  success: boolean;
  videoS3Key?: string;
  videoDurationMs?: number;
  errorMessage?: string;
  logs: string[];
  localVideoPath?: string;   // Raw video (no audio)
  finalVideoPath?: string;   // After audio muxing
  stepTimings?: StepTiming[]; // Timing data for debugging/verification
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  display: boolean;
  audio: boolean;
  timestamp: string;
}
