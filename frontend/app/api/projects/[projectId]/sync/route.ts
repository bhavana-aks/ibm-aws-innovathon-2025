// 10-12-25: Fixed to match manifest code_action to script lines for proper narration sync
// 08-12-25: Updated to use __STEP_META__ format for post-recording audio muxing
// 07-12-25: Created script synchronizer API endpoint using Bedrock
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';

// 10-12-25: Updated prompt to match code_action from manifest to script lines
const SYNC_SYSTEM_PROMPT = `You are a Playwright Script Annotator. Your job is to add step metadata comments that match manifest entries to script lines.

CRITICAL INSTRUCTION:
Match each manifest entry's code_action to the corresponding script line. The narration for each step must play during the correct action.

INPUTS PROVIDED:
- ORIGINAL_SCRIPT: The Playwright test to annotate
- MANIFEST: Array of {step_id, code_action, narration} - use code_action to find matching lines
- DURATION_MAP: Maps step numbers to audio durations in milliseconds

ALGORITHM:
1. For each manifest entry (in order):
   a. Find the script line that matches the code_action (partial match OK - match the action type and selector)
   b. Add step annotation BEFORE that line with the step_id and audioDuration
2. If a manifest entry's code_action doesn't match any script line, SKIP that step
3. Do NOT add annotations for script lines that have no matching manifest entry

MATCHING RULES:
- "page.goto" matches lines containing "page.goto"
- "page.fill('#username')" matches lines with "fill" and "username" 
- "page.click('#submit')" matches lines with "click" and "submit"
- Focus on the ACTION TYPE (goto, fill, click, etc.) and KEY IDENTIFIERS (username, password, submit, etc.)

CORRECT OUTPUT EXAMPLE:
Given manifest: [{step_id: 1, code_action: "page.goto(...)"}, {step_id: 2, code_action: "page.fill('#username')"}]

import { test, expect } from '@playwright/test';

test('Example', async ({ page }) => {
  // __STEP_META__: {"stepId": 1, "audioDuration": 3500}
  await page.goto('https://example.com');

  // __STEP_META__: {"stepId": 2, "audioDuration": 2800}
  await page.locator('[data-test="username"]').fill('test');
});

RULES:
1. stepId comes from the manifest's step_id field
2. Only annotate lines that have a matching code_action in the manifest
3. Keep all original code exactly as-is
4. Use {"stepId": N} format with double quotes
5. Return ONLY the annotated code. No explanations.`;

async function getFileContent(s3Key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || '';
  } catch (error) {
    console.error(`Error fetching file ${s3Key}:`, error);
    return '';
  }
}

async function syncScriptWithBedrock(
  originalScript: string,
  durationMap: Record<number, number>,
  manifest: Array<{ step_id: number; code_action: string; narration: string }>
): Promise<string> {
  // Sort manifest by step_id
  const sortedManifest = [...manifest].sort((a, b) => a.step_id - b.step_id);
  
  // Build manifest info for matching
  const manifestInfo = sortedManifest.map(step => ({
    step_id: step.step_id,
    code_action: step.code_action,
    audioDuration: durationMap[step.step_id] || 2000,
    narration_preview: step.narration.substring(0, 50)
  }));
  
  const prompt = `ORIGINAL_SCRIPT:
\`\`\`typescript
${originalScript}
\`\`\`

MANIFEST (match code_action to script lines):
${JSON.stringify(manifestInfo, null, 2)}

INSTRUCTIONS:
1. For each manifest entry, find the matching script line by comparing code_action
2. Add // __STEP_META__: {"stepId": <step_id>, "audioDuration": <audioDuration>} BEFORE the matching line
3. Match by action type (goto, fill, click) and key identifiers (username, password, submit, etc.)
4. If no match found for a manifest entry, skip it
5. Keep the original script code exactly as-is

Return ONLY the annotated TypeScript code.`;

  try {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 8192,
        system: SYNC_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    const textContent = responseBody.content?.[0]?.text || '';
    
    // Remove any markdown code fences if present
    let cleanedScript = textContent
      .replace(/^```(?:typescript|javascript|ts|js)?\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    return cleanedScript;
  } catch (error) {
    console.error('Bedrock invocation error:', error);
    throw error;
  }
}

/**
 * Extract key identifiers from a code action for matching
 * e.g., "page.fill('#username', 'test')" -> ['fill', 'username']
 */
function extractActionKeys(codeAction: string): string[] {
  const keys: string[] = [];
  
  // Extract action type (goto, fill, click, etc.)
  const actionMatch = codeAction.match(/\.(goto|fill|click|type|press|check|uncheck|select|hover|focus)\s*\(/i);
  if (actionMatch) {
    keys.push(actionMatch[1].toLowerCase());
  }
  
  // Extract expect actions
  const expectMatch = codeAction.match(/expect.*\.(toHaveURL|toHaveText|toBeVisible|toContain)/i);
  if (expectMatch) {
    keys.push('expect', expectMatch[1].toLowerCase());
  }
  
  // Extract key identifiers from selectors
  const identifiers = ['username', 'password', 'email', 'login', 'submit', 'checkout', 'cart', 
                       'firstName', 'lastName', 'postalCode', 'continue', 'finish', 'backpack',
                       'inventory', 'complete', 'header'];
  for (const id of identifiers) {
    if (codeAction.toLowerCase().includes(id.toLowerCase())) {
      keys.push(id.toLowerCase());
    }
  }
  
  return keys;
}

/**
 * Check if a script line matches a manifest code_action
 */
function lineMatchesAction(scriptLine: string, codeAction: string): boolean {
  const actionKeys = extractActionKeys(codeAction);
  const lineKeys = extractActionKeys(scriptLine);
  
  if (actionKeys.length === 0 || lineKeys.length === 0) return false;
  
  // Must match action type (first key is usually the action)
  const actionType = actionKeys[0];
  if (!lineKeys.includes(actionType)) return false;
  
  // Must match at least one identifier if present
  const actionIdentifiers = actionKeys.slice(1);
  const lineIdentifiers = lineKeys.slice(1);
  
  if (actionIdentifiers.length === 0) return true; // Only action type needed
  
  // Check if any identifier matches
  return actionIdentifiers.some(id => lineIdentifiers.includes(id));
}

/**
 * Annotate an original script by matching manifest code_actions to script lines
 */
function annotateOriginalScript(
  originalScript: string,
  durationMap: Record<number, number>,
  manifest: Array<{ step_id: number; code_action: string; narration: string }>
): string {
  const lines = originalScript.split('\n');
  const annotatedLines: string[] = [];
  const sortedManifest = [...manifest].sort((a, b) => a.step_id - b.step_id);
  
  // Track which manifest steps have been matched
  const matchedSteps = new Set<number>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check if this line is an executable action
    if (trimmedLine.startsWith('await page.') || trimmedLine.startsWith('await expect')) {
      // Find matching manifest entry
      for (const step of sortedManifest) {
        if (matchedSteps.has(step.step_id)) continue;
        
        if (lineMatchesAction(trimmedLine, step.code_action)) {
          const audioDuration = durationMap[step.step_id] || 2000;
          const indent = line.match(/^(\s*)/)?.[1] || '  ';
          annotatedLines.push(`${indent}// __STEP_META__: {"stepId": ${step.step_id}, "audioDuration": ${audioDuration}}`);
          matchedSteps.add(step.step_id);
          break;
        }
      }
    }
    
    annotatedLines.push(line);
  }
  
  return annotatedLines.join('\n');
}

// Generate a synchronized script with step metadata for post-recording audio muxing
function generateMockSyncedScript(
  originalScript: string | null,
  durationMap: Record<number, number>,
  manifest: Array<{ step_id: number; code_action: string; narration: string }>,
  projectId: string
): string {
  // If we have an original script, annotate it by matching code_actions
  if (originalScript && originalScript.trim()) {
    console.log('Annotating original script with manifest code_action matching');
    return annotateOriginalScript(originalScript, durationMap, manifest);
  }
  
  // Fallback: Generate script from manifest (used when no original script)
  // Only include manifest entries that have valid code_actions
  const validSteps = manifest.filter(step => 
    step.code_action && 
    (step.code_action.includes('page.') || step.code_action.includes('expect'))
  );
  
  const stepsCode = validSteps.map((step) => {
    const audioDuration = durationMap[step.step_id] || 2000;
    const codeAction = step.code_action.startsWith('await') 
      ? step.code_action 
      : `await ${step.code_action}`;
    
    return `  // __STEP_META__: {"stepId": ${step.step_id}, "audioDuration": ${audioDuration}}
  ${codeAction};`;
  }).join('\n\n');

  const playwrightTemplate = `import { test, expect } from '@playwright/test';

/**
 * Synchronized Video Recording Script - Project ${projectId}
 * 
 * This script uses __STEP_META__ comments to mark steps for audio synchronization.
 * Audio is muxed AFTER recording based on actual step execution timestamps.
 * 
 * Format: // __STEP_META__: {"stepId": N, "audioDuration": Nms}
 */

test('Synchronized Video Recording - Project ${projectId}', async ({ page }) => {
  // Set viewport for consistent video dimensions
  await page.setViewportSize({ width: 1920, height: 1080 });

${stepsCode}

  // Final pause before ending (allows last action to complete visually)
  await page.waitForTimeout(2000);
});
`;

  return playwrightTemplate;
}

// POST /api/projects/[projectId]/sync - Generate synchronized script
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    // Get project details
    const projectResult = await dynamoClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
    }));

    if (!projectResult.Item) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectResult.Item;

    if (!project.durationMap || Object.keys(project.durationMap).length === 0) {
      return NextResponse.json(
        { error: 'Audio must be generated first. No duration map found.' },
        { status: 400 }
      );
    }

    if (project.status !== 'AUDIO_COMPLETE') {
      return NextResponse.json(
        { error: 'Audio generation must be complete before syncing.' },
        { status: 400 }
      );
    }

    // Update status to SYNCING
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'SYNCING',
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Try to get original Playwright script from selected files
    let originalScript: string | null = null;
    const selectedFileIds = project.selectedFiles || [];
    
    for (const fileId of selectedFileIds) {
      const fileResult = await dynamoClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: formattedTenantId,
          SK: `FILE#${fileId}`,
        },
      }));

      if (fileResult.Item && fileResult.Item.type === 'test') {
        const content = await getFileContent(fileResult.Item.s3_key);
        if (content) {
          originalScript = content;
          break;
        }
      }
    }

    let syncedScript: string;
    const useMock = !process.env.AWS_ACCESS_KEY_ID || 
                   process.env.USE_MOCK_BEDROCK === 'true' ||
                   !S3_BUCKET;

    if (useMock || !originalScript) {
      console.log('Generating mock synchronized script');
      syncedScript = generateMockSyncedScript(
        originalScript,
        project.durationMap,
        project.manifest,
        projectId
      );
    } else {
      try {
        syncedScript = await syncScriptWithBedrock(
          originalScript,
          project.durationMap,
          project.manifest
        );
      } catch (bedrockError) {
        console.warn('Bedrock sync failed, falling back to mock:', bedrockError);
        syncedScript = generateMockSyncedScript(
          originalScript,
          project.durationMap,
          project.manifest,
          projectId
        );
      }
    }

    // Upload synced script to S3
    const cleanTenantId = formattedTenantId.replace('TENANT#', '');
    const syncedScriptS3Key = `scripts/${cleanTenantId}/${projectId}/synced_runner.ts`;

    if (S3_BUCKET) {
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: syncedScriptS3Key,
        Body: syncedScript,
        ContentType: 'text/typescript',
        Metadata: {
          'project-id': projectId,
          'tenant-id': cleanTenantId,
        },
      }));
    }

    // Update project with synced script location
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #syncedScriptS3Key = :syncedScriptS3Key, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#syncedScriptS3Key': 'syncedScriptS3Key',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'RENDERING',
        ':syncedScriptS3Key': syncedScriptS3Key,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return NextResponse.json({
      message: 'Script synchronized successfully',
      projectId,
      syncedScriptS3Key,
      status: 'RENDERING',
      scriptPreview: syncedScript.substring(0, 1000) + '...',
    });
  } catch (error) {
    console.error('Error syncing script:', error);

    // Update status to ERROR
    try {
      const { projectId } = await params;
      const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
      const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

      await dynamoClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: formattedTenantId,
          SK: `PROJ#${projectId}`,
        },
        UpdateExpression: 'SET #status = :status, #errorMessage = :errorMessage, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#errorMessage': 'errorMessage',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'ERROR',
          ':errorMessage': error instanceof Error ? error.message : 'Unknown sync error',
          ':updatedAt': new Date().toISOString(),
        },
      }));
    } catch (updateError) {
      console.error('Failed to update project status to ERROR:', updateError);
    }

    return NextResponse.json(
      { error: 'Failed to synchronize script' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[projectId]/sync - Get synced script
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const projectResult = await dynamoClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
    }));

    if (!projectResult.Item) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectResult.Item;

    if (!project.syncedScriptS3Key) {
      return NextResponse.json({
        hasSyncedScript: false,
        status: project.status,
      });
    }

    // Fetch the synced script from S3
    let scriptContent = '';
    if (S3_BUCKET) {
      try {
        scriptContent = await getFileContent(project.syncedScriptS3Key);
      } catch (s3Error) {
        console.warn('Could not fetch synced script from S3:', s3Error);
      }
    }

    return NextResponse.json({
      hasSyncedScript: true,
      syncedScriptS3Key: project.syncedScriptS3Key,
      scriptContent,
      status: project.status,
    });
  } catch (error) {
    console.error('Error fetching synced script:', error);
    return NextResponse.json(
      { error: 'Failed to fetch synced script' },
      { status: 500 }
    );
  }
}
