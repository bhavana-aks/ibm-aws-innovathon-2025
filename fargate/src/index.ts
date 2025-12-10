// 08-12-25: Add extensive logging for debugging container exits
// 08-12-25: Make audio playback optional and fix upload key selection
// 07-12-25: Created main entry point for video recording container
// Phase 5: Video Recording Container Main

import express from 'express';
import { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } from '@aws-sdk/client-sfn';
import { downloadFromS3, downloadAudioFiles, uploadToS3, getTextFromS3 } from './s3-utils';
import { recordVideo, recordVideoSimple } from './video-recorder';
import { VideoRecordingConfig, RecordingResult, HealthStatus } from './types';
import path from 'path';
import { mkdir, access, readdir, stat } from 'fs/promises';

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] [main] ${message}`);
}

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
  log(`Stack: ${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`UNHANDLED REJECTION: ${reason}`);
  process.exit(1);
});

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID || '';
const TENANT_ID = process.env.TENANT_ID || '';
const S3_BUCKET = process.env.S3_BUCKET || '';
const SYNCED_SCRIPT_S3_KEY = process.env.SYNCED_SCRIPT_S3_KEY || '';
const AUDIO_S3_PREFIX = process.env.AUDIO_S3_PREFIX || '';
const TASK_TOKEN = process.env.TASK_TOKEN || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_SIMPLE_RECORDING = process.env.USE_SIMPLE_RECORDING !== 'false';
const ENABLE_AUDIO_PLAYBACK = process.env.ENABLE_AUDIO_PLAYBACK === 'true';

// Paths
const AUDIO_DIR = process.env.AUDIO_PATH || '/tmp/audio';
const VIDEO_DIR = process.env.VIDEO_PATH || '/tmp/video';
const SCRIPT_DIR = process.env.SCRIPT_PATH || '/tmp/script';

// Clients
const sfnClient = new SFNClient({ region: AWS_REGION });

// Express app for health checks
const app = express();
const PORT = 3000;

let isRecording = false;
let recordingComplete = false;
let lastError: string | null = null;

app.get('/health', (_req, res) => {
  const status: HealthStatus = {
    status: isRecording || recordingComplete ? 'healthy' : 'healthy',
    display: true,
    audio: true,
    timestamp: new Date().toISOString(),
  };
  res.json(status);
});

app.get('/status', (_req, res) => {
  res.json({
    isRecording,
    recordingComplete,
    lastError,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
  });
});

/**
 * Send success callback to Step Functions
 */
async function sendTaskSuccess(result: RecordingResult): Promise<void> {
  if (!TASK_TOKEN) {
    console.log('No task token, skipping callback');
    return;
  }

  try {
    await sfnClient.send(new SendTaskSuccessCommand({
      taskToken: TASK_TOKEN,
      output: JSON.stringify(result),
    }));
    console.log('Sent success callback to Step Functions');
  } catch (error) {
    console.error('Failed to send success callback:', error);
  }
}

/**
 * Send failure callback to Step Functions
 */
async function sendTaskFailure(error: string): Promise<void> {
  if (!TASK_TOKEN) {
    console.log('No task token, skipping failure callback');
    return;
  }

  try {
    await sfnClient.send(new SendTaskFailureCommand({
      taskToken: TASK_TOKEN,
      error: 'VideoRecordingError',
      cause: error,
    }));
    console.log('Sent failure callback to Step Functions');
  } catch (err) {
    console.error('Failed to send failure callback:', err);
  }
}

/**
 * Main video recording workflow
 */
async function runVideoRecording(): Promise<void> {
  log('=== Video Recording Workflow Starting ===');
  log(`Project ID: ${PROJECT_ID}`);
  log(`Tenant ID: ${TENANT_ID}`);
  log(`S3 Bucket: ${S3_BUCKET}`);
  log(`Synced Script Key: ${SYNCED_SCRIPT_S3_KEY}`);
  log(`Audio Prefix: ${AUDIO_S3_PREFIX}`);
  log(`Use simple recording: ${USE_SIMPLE_RECORDING}`);
  log(`Enable audio playback: ${ENABLE_AUDIO_PLAYBACK}`);
  log(`Node version: ${process.version}`);
  log(`Platform: ${process.platform}`);
  log(`Memory usage: ${JSON.stringify(process.memoryUsage())}`);

  isRecording = true;
  lastError = null;

  try {
    // Validate required environment variables
    log('Validating environment variables...');
    if (!PROJECT_ID || !TENANT_ID || !S3_BUCKET) {
      throw new Error('Missing required environment variables: PROJECT_ID, TENANT_ID, or S3_BUCKET');
    }
    log('Environment variables validated');

    // Ensure directories exist
    log('Creating directories...');
    await mkdir(AUDIO_DIR, { recursive: true });
    await mkdir(VIDEO_DIR, { recursive: true });
    await mkdir(SCRIPT_DIR, { recursive: true });
    log('Directories created');

    // Download synced script
    let syncedScript = '';
    if (SYNCED_SCRIPT_S3_KEY) {
      log('Downloading synced script from S3...');
      try {
        syncedScript = await getTextFromS3(S3_BUCKET, SYNCED_SCRIPT_S3_KEY);
        log(`Downloaded script (${syncedScript.length} chars)`);
      } catch (s3Error) {
        log(`Failed to download script: ${s3Error}`);
        log('Using demo script as fallback');
        syncedScript = getDemoScript();
      }
    } else {
      log('No synced script key provided, using demo script');
      syncedScript = getDemoScript();
    }

    // Download audio files
    if (AUDIO_S3_PREFIX) {
      log('Downloading audio files...');
      try {
        const audioFiles = await downloadAudioFiles(S3_BUCKET, AUDIO_S3_PREFIX, AUDIO_DIR);
        log(`Downloaded ${audioFiles.length} audio files`);
      } catch (audioError) {
        log(`Failed to download audio files: ${audioError}`);
        log('Continuing without audio files');
      }
    } else {
      log('No audio prefix provided, skipping audio download');
    }

    // Prepare recording config
    const cleanTenantId = TENANT_ID.replace('TENANT#', '');
    const outputVideoS3Key = `videos/${cleanTenantId}/${PROJECT_ID}/recording.mp4`;
    log(`Output video S3 key: ${outputVideoS3Key}`);

    const config: VideoRecordingConfig = {
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      s3Bucket: S3_BUCKET,
      syncedScriptS3Key: SYNCED_SCRIPT_S3_KEY,
      audioS3Prefix: AUDIO_S3_PREFIX,
      outputVideoS3Key,
      taskToken: TASK_TOKEN,
      width: 1920,
      height: 1080,
      fps: 30,
      enableAudioPlayback: ENABLE_AUDIO_PLAYBACK,
    };

    // Set synced script in environment for the recorder
    process.env.SYNCED_SCRIPT = syncedScript;
    
    // Log script preview for debugging
    log('=== Synced Script Preview ===');
    log(syncedScript.substring(0, 500) + '...');
    log('=== End Script Preview ===');

    // Record video
    log('=== Starting video recording ===');
    let result: RecordingResult;

    if (USE_SIMPLE_RECORDING) {
      log('Using SIMPLE recording mode');
      result = await recordVideoSimple(config, syncedScript);
    } else {
      log('Using FULL recording mode');
      try {
        result = await recordVideo(config);
      } catch (primaryError) {
        log(`Full recording failed: ${primaryError}`);
        log('Attempting simple fallback...');
        result = await recordVideoSimple(config, syncedScript);
      }
    }

    log('=== Recording finished ===');
    log(`Recording success: ${result.success}`);
    log(`Recording logs: ${result.logs.join(' | ')}`);
    if (result.errorMessage) {
      log(`Recording error: ${result.errorMessage}`);
    }
    if (result.localVideoPath) {
      log(`Local video path: ${result.localVideoPath}`);
    }

    // List video directory contents
    log('Listing video directory contents...');
    try {
      const videoFiles = await readdir(VIDEO_DIR);
      log(`Files in ${VIDEO_DIR}: ${JSON.stringify(videoFiles)}`);
      for (const file of videoFiles) {
        try {
          const fileStat = await stat(path.join(VIDEO_DIR, file));
          log(`  ${file}: ${fileStat.size} bytes`);
        } catch {
          log(`  ${file}: could not stat`);
        }
      }
    } catch (e) {
      log(`Could not list video directory: ${e}`);
    }

    // Upload video to S3
    if (result.success) {
      log('Recording successful, preparing upload...');
      const fallbackMp4 = path.join(VIDEO_DIR, `${PROJECT_ID}_raw.mp4`);
      const fallbackWebm = path.join(VIDEO_DIR, `${PROJECT_ID}_raw.webm`);
      
      // Prefer the final video path (muxed with audio) if available
      const localVideoPath = result.finalVideoPath || result.localVideoPath || fallbackMp4;
      
      const hasWebmExt = localVideoPath.endsWith('.webm');
      const uploadKey = hasWebmExt
        ? outputVideoS3Key.replace(/\.mp4$/, '.webm')
        : outputVideoS3Key;
      const contentType = hasWebmExt ? 'video/webm' : 'video/mp4';

      log(`Attempting upload from: ${localVideoPath}`);
      log(`Upload key: ${uploadKey}`);
      log(`Content type: ${contentType}`);

      try {
        await access(localVideoPath);
        log(`File exists: ${localVideoPath}`);
        const fileStat = await stat(localVideoPath);
        log(`File size: ${fileStat.size} bytes`);
        
        log('Starting S3 upload...');
        await uploadToS3(localVideoPath, S3_BUCKET, uploadKey, contentType);
        result.videoS3Key = uploadKey;
        log(`Video uploaded to: s3://${S3_BUCKET}/${uploadKey}`);
      } catch (uploadError) {
        log(`Primary upload failed from ${localVideoPath}: ${uploadError}`);
        
        // Try to find any video file in the directory
        log('Searching for any video file in directory...');
        try {
          const videoFiles = await readdir(VIDEO_DIR);
          const anyVideo = videoFiles.find(f => f.endsWith('.webm') || f.endsWith('.mp4'));
          if (anyVideo) {
            const anyVideoPath = path.join(VIDEO_DIR, anyVideo);
            const isWebm = anyVideo.endsWith('.webm');
            const finalKey = isWebm ? outputVideoS3Key.replace(/\.mp4$/, '.webm') : outputVideoS3Key;
            const finalContentType = isWebm ? 'video/webm' : 'video/mp4';
            
            log(`Found video file: ${anyVideoPath}`);
            const fileStat = await stat(anyVideoPath);
            log(`File size: ${fileStat.size} bytes`);
            
            await uploadToS3(anyVideoPath, S3_BUCKET, finalKey, finalContentType);
            result.videoS3Key = finalKey;
            log(`Uploaded discovered video to: s3://${S3_BUCKET}/${finalKey}`);
          } else {
            log('No video files found in directory');
          }
        } catch (fallbackError) {
          log(`Fallback upload also failed: ${fallbackError}`);
        }
      }
    } else {
      log('Recording was not successful, skipping upload');
    }

    // Send callback
    if (result.success && result.videoS3Key) {
      log('Sending success callback...');
      await sendTaskSuccess(result);
      log('Success callback sent');
    } else {
      log('Sending failure callback...');
      await sendTaskFailure(result.errorMessage || 'Unknown error or no video produced');
      log('Failure callback sent');
    }

    recordingComplete = true;
    log('=== Video Recording Workflow Complete ===');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    log(`Video recording failed: ${errorMessage}`);
    log(`Stack: ${errorStack}`);
    lastError = errorMessage;
    
    await sendTaskFailure(errorMessage);
    
    recordingComplete = true;
  } finally {
    isRecording = false;
    log('Recording workflow finished, isRecording set to false');
  }
}

/**
 * Demo script for testing without S3
 */
function getDemoScript(): string {
  return `
import { test, expect } from '@playwright/test';

test('Demo Video Recording', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // Navigate to example.com
  await page.goto('https://example.com');
  await page.waitForTimeout(3000);
  
  // Take a screenshot of the main content
  await page.screenshot({ path: '/tmp/video/screenshot.png' });
  await page.waitForTimeout(2000);
  
  // Done
  console.log('Demo recording complete');
});
`;
}

// Start health check server
log('Starting health check server...');
app.listen(PORT, () => {
  log(`Health check server running on port ${PORT}`);
});

// Start video recording workflow
log('Starting video recording workflow...');
runVideoRecording()
  .then(() => {
    log('Video recording workflow finished successfully');
    // Keep container running for a bit for final callbacks
    log('Waiting 5 seconds before exit...');
    setTimeout(() => {
      log('Exiting container with code 0');
      process.exit(0);
    }, 5000);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    log(`Fatal error in workflow: ${errorMessage}`);
    log(`Stack: ${errorStack}`);
    log('Exiting container with code 1');
    process.exit(1);
  });
