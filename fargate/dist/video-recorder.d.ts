import { VideoRecordingConfig, RecordingResult } from './types';
/**
 * Main video recording function
 */
export declare function recordVideo(config: VideoRecordingConfig): Promise<RecordingResult>;
/**
 * Record video with timestamp tracking and post-recording audio muxing
 * This approach records video silently, then muxes audio at correct timestamps
 */
export declare function recordVideoSimple(config: VideoRecordingConfig, syncedScript: string): Promise<RecordingResult>;
//# sourceMappingURL=video-recorder.d.ts.map