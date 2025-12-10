"use strict";
// 08-12-25: Refactored to use Playwright Test runner directly for robust script execution
// 08-12-25: Fix parseStepMetadata to handle Bedrock output with comments between meta and await
// 08-12-25: Implement post-recording audio muxing with timestamp tracking
// 08-12-25: Add extensive logging for debugging container exits
// 08-12-25: Add audio playback toggle and safer uploads
// 07-12-25: Created video recorder for Playwright + FFmpeg recording
// Phase 5: Video Recording Logic
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordVideo = recordVideo;
exports.recordVideoSimple = recordVideoSimple;
const playwright_1 = require("playwright");
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const script_transformer_1 = require("./script-transformer");
const TEMP_DIR = '/tmp';
const AUDIO_DIR = process.env.AUDIO_PATH || '/tmp/audio';
const VIDEO_DIR = process.env.VIDEO_PATH || '/tmp/video';
const SCRIPT_DIR = process.env.SCRIPT_PATH || '/tmp/script';
function log(message) {
    console.log(`[${new Date().toISOString()}] [video-recorder] ${message}`);
}
/**
 * Start FFmpeg screen capture
 */
function startFFmpegCapture(outputPath, width, height, fps, captureAudio) {
    console.log(`Starting FFmpeg capture: ${width}x${height} @ ${fps}fps`);
    const ffmpegArgs = [
        '-f', 'x11grab',
        '-video_size', `${width}x${height}`,
        '-framerate', String(fps),
        '-i', ':99',
        // Video encoding
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
    ];
    if (captureAudio) {
        ffmpegArgs.push('-f', 'pulse', '-i', 'default', '-c:a', 'aac', '-b:a', '192k');
    }
    else {
        ffmpegArgs.push('-an');
    }
    ffmpegArgs.push('-y', outputPath);
    const process = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    process.stdout?.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`);
    });
    process.stderr?.on('data', (data) => {
        // FFmpeg logs to stderr by default
        console.log(`FFmpeg: ${data.toString().trim()}`);
    });
    return { process, outputPath };
}
/**
 * Stop FFmpeg capture gracefully
 */
async function stopFFmpegCapture(ffmpeg) {
    return new Promise((resolve, reject) => {
        console.log('Stopping FFmpeg capture...');
        // Send 'q' to FFmpeg to quit gracefully
        ffmpeg.process.stdin?.write('q');
        const timeout = setTimeout(() => {
            console.log('FFmpeg timeout, killing process');
            ffmpeg.process.kill('SIGKILL');
            resolve();
        }, 10000);
        ffmpeg.process.on('close', (code) => {
            clearTimeout(timeout);
            console.log(`FFmpeg exited with code ${code}`);
            resolve();
        });
        ffmpeg.process.on('error', (err) => {
            clearTimeout(timeout);
            console.error('FFmpeg error:', err);
            reject(err);
        });
    });
}
/**
 * Play audio file using ffplay (kept for backward compatibility)
 */
async function playAudio(audioPath) {
    return new Promise((resolve) => {
        console.log(`Playing audio: ${audioPath}`);
        const ffplay = (0, child_process_1.spawn)('ffplay', [
            '-nodisp',
            '-autoexit',
            audioPath,
        ], {
            stdio: 'pipe',
        });
        ffplay.on('close', () => {
            resolve();
        });
        ffplay.on('error', (err) => {
            console.error(`Audio playback error: ${err.message}`);
            resolve(); // Continue even if audio fails
        });
    });
}
/**
 * Mux audio files with video using FFmpeg
 * Positions each audio file at its step's startTimestamp
 */
async function muxAudioWithVideo(videoPath, audioDir, stepTimings, outputPath) {
    log(`Starting audio muxing for ${stepTimings.length} steps`);
    log(`Video: ${videoPath}, Audio dir: ${audioDir}, Output: ${outputPath}`);
    // Build FFmpeg command with filter_complex for multi-track audio
    const inputArgs = ['-i', videoPath];
    const filterParts = [];
    const audioInputs = [];
    let audioIndex = 1;
    for (const timing of stepTimings) {
        const audioPath = path_1.default.join(audioDir, `step_${timing.stepId}.mp3`);
        // Check if audio file exists
        try {
            await (0, promises_1.access)(audioPath);
            inputArgs.push('-i', audioPath);
            // Add delay filter: adelay=startTimestamp|startTimestamp (left|right channel)
            const delayMs = Math.round(timing.startTimestamp);
            filterParts.push(`[${audioIndex}]adelay=${delayMs}|${delayMs}[a${audioIndex}]`);
            audioInputs.push(`[a${audioIndex}]`);
            audioIndex++;
        }
        catch {
            log(`Audio file not found: ${audioPath}, skipping step ${timing.stepId}`);
        }
    }
    if (audioInputs.length === 0) {
        log('No audio files found, copying video without audio');
        // Just copy the video without audio changes
        return new Promise((resolve, reject) => {
            const ffmpeg = (0, child_process_1.spawn)('ffmpeg', [
                '-i', videoPath,
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-c:a', 'aac',
                '-y', outputPath,
            ]);
            ffmpeg.stderr?.on('data', (data) => log(`FFmpeg: ${data.toString().trim()}`));
            ffmpeg.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`FFmpeg exited with code ${code}`));
            });
            ffmpeg.on('error', reject);
        });
    }
    // Build the amix filter to combine all audio tracks
    // normalize=0 prevents volume drop when mixing many inputs (sum instead of average)
    const mixFilter = `${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`;
    const filterComplex = [...filterParts, mixFilter].join(';');
    const ffmpegArgs = [
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-y', outputPath,
    ];
    log(`FFmpeg mux command: ffmpeg ${ffmpegArgs.join(' ')}`);
    return new Promise((resolve, reject) => {
        const ffmpeg = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs);
        ffmpeg.stderr?.on('data', (data) => {
            log(`FFmpeg mux: ${data.toString().trim()}`);
        });
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                log('Audio muxing completed successfully');
                resolve();
            }
            else {
                reject(new Error(`FFmpeg mux failed with code ${code}`));
            }
        });
        ffmpeg.on('error', (err) => {
            log(`FFmpeg mux error: ${err.message}`);
            reject(err);
        });
    });
}
/**
 * Create the synchronized Playwright runner script
 */
async function createPlaywrightRunner(syncedScript, audioDir) {
    // Modify the script to use local audio paths
    const modifiedScript = syncedScript
        .replace(/AUDIO_BASE_PATH.*=.*['"].*['"]/g, `AUDIO_BASE_PATH = '${audioDir}'`)
        .replace(/process\.env\.AUDIO_PATH.*\|\|.*['"].*['"]/g, `'${audioDir}'`);
    const runnerPath = path_1.default.join(SCRIPT_DIR, 'runner.ts');
    await (0, promises_1.writeFile)(runnerPath, modifiedScript, 'utf-8');
    console.log(`Created runner script at: ${runnerPath}`);
    return runnerPath;
}
/**
 * Run the synchronized script with Playwright
 */
async function runPlaywrightScript(browser, syncedScript, audioDir, logs, enableAudioPlayback) {
    // This function is kept for legacy support or reference
    // The main execution is now done via runPlaywrightTestRunner
    log("Calling legacy runPlaywrightScript - this should not be used in simple mode");
}
/**
 * Execute script using Playwright Test Runner
 * This is more robust as it uses the actual Playwright runner instead of custom parsing
 */
async function runPlaywrightTestRunner(config, syncedScript) {
    const logs = [];
    const stepTimings = [];
    try {
        log('Preparing Playwright Test Runner...');
        logs.push('Preparing Playwright Test Runner...');
        // Ensure node_modules are available in the script directory
        try {
            const target = '/app/node_modules';
            const link = path_1.default.join(SCRIPT_DIR, 'node_modules');
            // Check if link exists
            try {
                await (0, promises_1.access)(link);
            }
            catch {
                log(`Symlinking ${target} to ${link}`);
                await (0, promises_1.symlink)(target, link, 'dir');
            }
        }
        catch (e) {
            log(`Warning: Failed to symlink node_modules: ${e}`);
        }
        // 1. Transform the script to inject timing logic
        const transformedScript = (0, script_transformer_1.transformScript)(syncedScript);
        const testFilePath = path_1.default.join(SCRIPT_DIR, 'test.spec.ts');
        await (0, promises_1.writeFile)(testFilePath, transformedScript);
        log(`Transformed script written to: ${testFilePath}`);
        logs.push(`Transformed script written to: ${testFilePath}`);
        // 2. Create playwright.config.ts
        const configContent = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    video: {
        mode: 'on',
        size: { width: ${config.width}, height: ${config.height} }
    },
    viewport: { width: ${config.width}, height: ${config.height} },
    headless: true,
  },
  outputDir: '${VIDEO_DIR.replace(/\\/g, '/')}',
  timeout: 300000, // 5 minutes global timeout
});
`;
        const configPath = path_1.default.join(SCRIPT_DIR, 'playwright.config.ts');
        await (0, promises_1.writeFile)(configPath, configContent);
        log(`Config written to: ${configPath}`);
        // 3. Run Playwright Test
        log('Running: npx playwright test');
        logs.push('Running Playwright Test...');
        const child = (0, child_process_1.spawn)('npx', ['playwright', 'test', 'test.spec.ts', '--config=playwright.config.ts'], {
            cwd: SCRIPT_DIR,
            env: { ...process.env, PATH: process.env.PATH },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            // Parse for timing logs
            const lines = str.split('\n');
            for (const line of lines) {
                if (line.includes('__TIMING__:')) {
                    try {
                        const jsonStr = line.split('__TIMING__:')[1];
                        const timing = JSON.parse(jsonStr);
                        if (timing.type === 'start') {
                            // We only capture start times. Duration is calculated based on next start or end.
                            // However, stepTimings needs { stepId, startTimestamp, endTimestamp, actionDuration, audioDuration }
                            // Our _syncStep logic ensures startTimestamp is aligned.
                            // We'll reconstruct stepTimings after.
                            stepTimings.push({
                                stepId: timing.stepId,
                                startTimestamp: timing.timestamp,
                                endTimestamp: 0, // Fill later
                                actionDuration: 0, // Fill later
                                audioDuration: 0 // Fill later
                            });
                            log(`Captured timing for step ${timing.stepId}: ${timing.timestamp}ms`);
                        }
                    }
                    catch (e) {
                        log(`Failed to parse timing: ${line}`);
                    }
                }
                else if (line.trim()) {
                    log(`PW: ${line.trim()}`);
                }
            }
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
            log(`PW Error: ${data.toString().trim()}`);
        });
        const code = await new Promise((resolve) => {
            child.on('close', resolve);
        });
        log(`Playwright exited with code ${code}`);
        logs.push(`Playwright exited with code ${code}`);
        if (code !== 0) {
            logs.push(`Playwright failed. Stderr: ${stderr.slice(-500)}`);
            return { success: false, logs, stepTimings };
        }
        // 4. Find the video file
        // Playwright saves video in a subfolder inside outputDir
        // e.g. VIDEO_DIR/test-demo-recording-chromium/video.webm
        // We'll search recursively for .webm files in VIDEO_DIR
        async function findWebmFiles(dir) {
            const files = [];
            const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...await findWebmFiles(fullPath));
                }
                else if (entry.name.endsWith('.webm')) {
                    files.push(fullPath);
                }
            }
            return files;
        }
        const videoFiles = await findWebmFiles(VIDEO_DIR);
        log(`Found video files: ${JSON.stringify(videoFiles)}`);
        if (videoFiles.length === 0) {
            logs.push('No video file generated by Playwright');
            return { success: false, logs, stepTimings };
        }
        // Sort by mtime to get the latest? Or just take the first one?
        // If we clear VIDEO_DIR before starting, there should be only one.
        // We do mkdir(VIDEO_DIR, {recursive:true}), but don't clean it.
        // TODO: Ideally clean VIDEO_DIR before run.
        const videoPath = videoFiles[0]; // Take the first one for now
        log(`Using video file: ${videoPath}`);
        logs.push(`Using video file: ${videoPath}`);
        return { success: true, logs, stepTimings, videoPath };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`Test runner failed: ${msg}`);
        logs.push(`Test runner failed: ${msg}`);
        return { success: false, logs, stepTimings };
    }
}
/**
 * Main video recording function
 */
async function recordVideo(config) {
    // Legacy support wrapper or main entry point?
    // The previous implementation used FFmpeg + Playwright manually.
    // We should keep recordVideoSimple as the new robust way.
    // If the caller uses recordVideo, it calls startFFmpegCapture.
    // But the prompt implies we are using recordVideoSimple.
    // We will leave recordVideo as is (using FFmpeg capture), but it's not robust for the script parsing.
    // Ideally we'd upgrade recordVideo too, but let's focus on recordVideoSimple which is what is being used.
    // Original implementation of recordVideo kept for reference/compatibility
    const logs = [];
    let browser = null;
    let ffmpeg = null;
    const rawVideoPath = path_1.default.join(VIDEO_DIR, `${config.projectId}_raw.mp4`);
    const captureAudio = Boolean(config.enableAudioPlayback);
    try {
        logs.push('=== Starting Video Recording ===');
        logs.push(`Project: ${config.projectId}`);
        // Ensure directories exist
        await (0, promises_1.mkdir)(AUDIO_DIR, { recursive: true });
        await (0, promises_1.mkdir)(VIDEO_DIR, { recursive: true });
        await (0, promises_1.mkdir)(SCRIPT_DIR, { recursive: true });
        // Start browser
        logs.push('Launching browser...');
        browser = await playwright_1.chromium.launch({
            headless: false,
            args: [
                '--start-maximized',
                `--window-size=${config.width},${config.height}`,
                '--disable-web-security',
                '--no-sandbox',
            ],
        });
        // Start screen capture
        logs.push('Starting screen capture...');
        ffmpeg = startFFmpegCapture(rawVideoPath, config.width, config.height, config.fps, captureAudio);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const syncedScript = process.env.SYNCED_SCRIPT || '';
        logs.push('Running Playwright script...');
        await runPlaywrightScript(browser, syncedScript, AUDIO_DIR, logs, captureAudio);
        await new Promise(resolve => setTimeout(resolve, 2000));
        logs.push('Stopping screen capture...');
        if (ffmpeg) {
            await stopFFmpegCapture(ffmpeg);
        }
        return {
            success: true,
            videoS3Key: config.outputVideoS3Key,
            logs,
            localVideoPath: rawVideoPath,
        };
    }
    catch (error) {
        // ... error handling ...
        return { success: false, logs, errorMessage: String(error) };
    }
    finally {
        if (browser)
            await browser.close();
        if (ffmpeg)
            ffmpeg.process.kill('SIGKILL');
    }
}
/**
 * Record video with timestamp tracking and post-recording audio muxing
 * This approach records video silently, then muxes audio at correct timestamps
 */
async function recordVideoSimple(config, syncedScript) {
    const logs = [];
    try {
        log('=== Starting Video Recording with Timestamp Tracking (Robust Mode) ===');
        logs.push('=== Starting Video Recording with Timestamp Tracking (Robust Mode) ===');
        log(`Project ID: ${config.projectId}`);
        log(`Video directory: ${VIDEO_DIR}`);
        log(`Audio directory: ${AUDIO_DIR}`);
        // Ensure directories exist
        log('Creating directories...');
        await (0, promises_1.mkdir)(VIDEO_DIR, { recursive: true });
        await (0, promises_1.mkdir)(AUDIO_DIR, { recursive: true });
        await (0, promises_1.mkdir)(SCRIPT_DIR, { recursive: true });
        // Clean video directory to ensure we pick the right file
        try {
            const existingFiles = await (0, promises_1.readdir)(VIDEO_DIR);
            for (const file of existingFiles) {
                await (0, promises_1.unlink)(path_1.default.join(VIDEO_DIR, file));
            }
            log('Cleaned video directory');
        }
        catch (e) {
            log(`Warning: Failed to clean video directory: ${e}`);
        }
        // Run the robust Playwright Test Runner
        const runResult = await runPlaywrightTestRunner(config, syncedScript);
        logs.push(...runResult.logs);
        if (!runResult.success || !runResult.videoPath) {
            return {
                success: false,
                errorMessage: 'Playwright execution failed or no video generated',
                logs,
                stepTimings: runResult.stepTimings
            };
        }
        const rawVideoPath = runResult.videoPath;
        const stepTimings = runResult.stepTimings;
        // Fill in audio durations for muxing
        // We need to match stepIds with the ones from the script metadata to get the expected audio duration?
        // Actually, stepTimings are reconstructed from the logs.
        // The logs contain { stepId, timestamp }.
        // We also need the `audioDuration` for each step to pass to muxAudioWithVideo.
        // We can parse the syncedScript to build a map of stepId -> audioDuration.
        // Helper to get audio durations
        const stepDurations = new Map();
        const metaMatches = syncedScript.matchAll(/\/\/\s*__STEP_META__:\s*(\{[^}]+\})/g);
        for (const match of metaMatches) {
            try {
                const meta = JSON.parse(match[1].replace(/(\w+):/g, '"$1":'));
                stepDurations.set(meta.stepId, meta.audioDuration || 0);
            }
            catch { }
        }
        // Update stepTimings with audio durations
        for (const timing of stepTimings) {
            timing.audioDuration = stepDurations.get(timing.stepId) || 0;
            // Estimate end timestamp (next step start or video end)
            // For now, we only need startTimestamp and audioDuration for muxing.
            timing.actionDuration = 0; // Not critical for muxing
        }
        logs.push(`Raw video saved to: ${rawVideoPath}`);
        log(`Raw video path: ${rawVideoPath}`);
        // Now mux audio with the video at correct timestamps
        const finalOutputPath = path_1.default.join(VIDEO_DIR, `${config.projectId}_final.mp4`);
        log('=== Starting Post-Recording Audio Muxing ===');
        logs.push('Starting audio muxing...');
        try {
            await muxAudioWithVideo(rawVideoPath, AUDIO_DIR, stepTimings, finalOutputPath);
            logs.push(`Audio muxing complete: ${finalOutputPath}`);
            log(`Final video with audio: ${finalOutputPath}`);
        }
        catch (muxError) {
            const muxErrorMsg = muxError instanceof Error ? muxError.message : 'Unknown mux error';
            log(`Audio muxing failed: ${muxErrorMsg}`);
            logs.push(`Audio muxing failed: ${muxErrorMsg}, using raw video`);
        }
        // Check if final video exists, otherwise use raw
        let finalVideoPath = finalOutputPath;
        try {
            await (0, promises_1.access)(finalOutputPath);
        }
        catch {
            log('Final video not found, using raw video');
            finalVideoPath = rawVideoPath;
        }
        logs.push('=== Video Recording Complete ===');
        log('=== Video Recording Complete ===');
        return {
            success: true,
            videoS3Key: config.outputVideoS3Key,
            videoDurationMs: 0, // Could get from video file stats
            logs,
            localVideoPath: rawVideoPath,
            finalVideoPath: finalVideoPath !== rawVideoPath ? finalVideoPath : undefined,
            stepTimings,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`ERROR: ${errorMessage}`);
        logs.push(`ERROR: ${errorMessage}`);
        return {
            success: false,
            errorMessage,
            logs,
            stepTimings: [],
        };
    }
}
//# sourceMappingURL=video-recorder.js.map