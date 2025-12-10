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
    startTimestamp: number;
    endTimestamp: number;
    actionDuration: number;
    audioDuration: number;
}
export interface RecordingResult {
    success: boolean;
    videoS3Key?: string;
    videoDurationMs?: number;
    errorMessage?: string;
    logs: string[];
    localVideoPath?: string;
    finalVideoPath?: string;
    stepTimings?: StepTiming[];
}
export interface HealthStatus {
    status: 'healthy' | 'unhealthy';
    display: boolean;
    audio: boolean;
    timestamp: string;
}
//# sourceMappingURL=types.d.ts.map