// 10-12-25: Fixed timing - set _scriptStartTime at first step execution, not module load
// 09-12-25: Keep script start timestamp stable across tests to avoid overlapping audio

import fs from 'fs';
import path from 'path';

/**
 * Transforms a Playwright script by injecting timing synchronization logic.
 * This ensures that actions wait for their corresponding audio duration.
 */
export function transformScript(scriptContent: string): string {
  const lines = scriptContent.split('\n');
  const processedLines: string[] = [];
  
  // Helper code to inject at the top of the file
  const helperCode = `
// === INJECTED HELPER CODE ===
let _lastStepStart = Date.now();
let _lastAudioDuration = 0;
let _scriptStartTime = 0;  // Will be set at first step execution
let _firstStepExecuted = false;

function _resetTimer() {
    _lastStepStart = Date.now();
    _lastAudioDuration = 0;
    _scriptStartTime = 0;  // Reset for fresh calculation
    _firstStepExecuted = false;  // Allow re-initialization
    console.log('Timer reset for video synchronization');
}

async function _waitForFinalAudio(page: any) {
    if (_lastAudioDuration > 0) {
        console.log(\`Waiting \${_lastAudioDuration}ms for final audio\`);
        if (page) await page.waitForTimeout(_lastAudioDuration);
        else await new Promise(r => setTimeout(r, _lastAudioDuration));
    }
}

async function _syncStep(page: any, stepId: number, audioDuration: number) {
    // On first step, establish the base time AFTER video has started recording
    if (!_firstStepExecuted) {
        // Small stabilization delay to ensure video recording is stable
        await page.waitForTimeout(100);
        _scriptStartTime = Date.now();
        _firstStepExecuted = true;
        console.log('__VIDEO_START__:' + _scriptStartTime);
        console.log('Video sync base time established at first step');
    }

    const now = Date.now();
    // If there was a previous step, check if we need to wait
    if (_lastAudioDuration > 0) {
        const elapsed = now - _lastStepStart;
        if (elapsed < _lastAudioDuration) {
             const waitMs = _lastAudioDuration - elapsed; 
             console.log(\`Waiting \${waitMs}ms for audio sync (Step \${stepId-1})\`);
             if (page) await page.waitForTimeout(waitMs);
             else await new Promise(r => setTimeout(r, waitMs));
        }
    }

    // Log timing for post-processing - timestamp is now relative to first step execution
    const stepStartRel = Date.now() - _scriptStartTime;
    console.log('__TIMING__:' + JSON.stringify({ 
        stepId, 
        timestamp: stepStartRel, 
        type: 'start' 
    }));
    
    // Reset for this step
    _lastStepStart = Date.now();
    _lastAudioDuration = audioDuration;
}

// Reset timer before test starts to align with video recording start
// We use a unique alias to avoid conflicts with existing imports
import { test as _injectedPwTest } from '@playwright/test';
_injectedPwTest.beforeEach(async () => {
    _resetTimer();
});

// Ensure we wait for the last audio file to finish playing
_injectedPwTest.afterEach(async ({ page }) => {
    await _waitForFinalAudio(page);
});
// === END INJECTED HELPER CODE ===
`;

  // Insert helper code after imports (heuristic: look for first empty line after imports?)
  // Or just put it at the top, but imports must come first in ES modules if using 'import'.
  // However, Playwright tests are often TS files.
  // We can inject it after the last import.
  
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }
  
  // If no imports, put at top. If imports, put after.
  const headerLines = lines.slice(0, lastImportIndex + 1);
  const bodyLines = lines.slice(lastImportIndex + 1);
  
  processedLines.push(...headerLines);
  processedLines.push(helperCode);

  // Process body lines
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const metaMatch = line.match(/\/\/\s*__STEP_META__:\s*(\{[^}]+\})/);
    
    if (metaMatch) {
      try {
        let stepId = 0;
        let duration = 0;

        // Try relaxed parsing strategy
        const rawMeta = metaMatch[1];
        
        // Strategy 1: Regex extraction (most robust for simple KV pairs)
        const stepIdMatch = rawMeta.match(/['"]?stepId['"]?\s*:\s*(\d+)/);
        const durationMatch = rawMeta.match(/['"]?audioDuration['"]?\s*:\s*(\d+)/);
        
        if (stepIdMatch) {
            stepId = parseInt(stepIdMatch[1], 10);
        }
        
        if (durationMatch) {
            duration = parseInt(durationMatch[1], 10);
        }

        // Strategy 2: If regex failed, try JSON parse with key fixing
        if (!stepId) {
            try {
                // Fix unquoted keys: replace key: with "key":
                // But avoid replacing already quoted keys "key":
                // Regex: match word followed by colon, NOT preceded by quote
                const jsonStr = rawMeta.replace(/(?<!["'])\b(\w+)\b\s*:/g, '"$1":');
                const meta = JSON.parse(jsonStr);
                stepId = meta.stepId;
                duration = meta.audioDuration || 0;
            } catch (jsonErr) {
                 // Ignore JSON error if regex failed too
            }
        }
        
        if (!stepId) {
             // If still no stepId, we can't process this meta
             throw new Error('Could not extract stepId');
        }
        
        // Look ahead for test block start
        let isBlockStart = false;
        let braceIndex = -1;
        
        // Check next few lines for 'test(' or 'test.beforeEach(' etc.
        let j = i + 1;
        while (j < bodyLines.length && j < i + 5) {
            const nextLine = bodyLines[j].trim();
            if (!nextLine) { j++; continue; } // skip empty
            
            // Check if this line starts a block
            if (nextLine.match(/test(\.beforeEach|\.describe|\.step)?\s*\(/)) {
                // It is a block start. We need to find the opening brace.
                if (nextLine.includes('{')) {
                   isBlockStart = true;
                   braceIndex = nextLine.indexOf('{');
                   // We need to inject AFTER this brace.
                   // But we are iterating 'i'. We need to modify the line at 'j'.
                   
                   // Strategy: Replace the META line with empty string (or comment)
                   // And modify line 'j' to include the sync call.
                   
                  const originalLine = bodyLines[j];
                  const syncCall = ` await _syncStep(page, ${stepId}, ${duration}); `;
                  
                  // Prefer inserting after the block brace (post-arrow) to avoid the param destructuring brace
                  const arrowIndex = originalLine.indexOf('=>');
                  const braceAfterArrow = arrowIndex >= 0 ? originalLine.indexOf('{', arrowIndex) : -1;
                  const openBracePos = braceAfterArrow >= 0 ? braceAfterArrow : originalLine.indexOf('{');
                  
                  const newLine = openBracePos >= 0
                    ? originalLine.slice(0, openBracePos + 1) + syncCall + originalLine.slice(openBracePos + 1)
                    : `${originalLine} ${syncCall}`;
                  
                  bodyLines[j] = newLine;
                   
                   processedLines.push(`// Processed Step ${stepId}`); // replace meta line
                   break;
                }
            } else {
                // Not a block start (e.g. await page.goto)
                // Just replace the meta line with the sync call
                processedLines.push(`await _syncStep(page, ${stepId}, ${duration});`);
                break;
            }
            j++;
        }
        
        if (!isBlockStart && j >= Math.min(bodyLines.length, i + 5)) {
             // Didn't find anything interesting, just inject the call
             processedLines.push(`await _syncStep(page, ${stepId}, ${duration});`);
        } else if (isBlockStart) {
            // We already modified bodyLines[j], so current line (meta) is skipped/commented
        }
        
      } catch (e) {
        processedLines.push(line); // Keep original if parse fails
        console.error(`Failed to parse meta: ${line}`);
      }
    } else {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}
