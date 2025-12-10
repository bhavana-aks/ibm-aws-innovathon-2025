/**
 * Download a file from S3 to local path
 */
export declare function downloadFromS3(bucket: string, key: string, localPath: string): Promise<void>;
/**
 * Download all audio files for a project
 */
export declare function downloadAudioFiles(bucket: string, audioPrefix: string, localAudioDir: string): Promise<string[]>;
/**
 * Upload a file to S3
 */
export declare function uploadToS3(localPath: string, bucket: string, key: string, contentType?: string): Promise<void>;
/**
 * Get text content from S3
 */
export declare function getTextFromS3(bucket: string, key: string): Promise<string>;
//# sourceMappingURL=s3-utils.d.ts.map