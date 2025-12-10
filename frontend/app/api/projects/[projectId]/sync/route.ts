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

// 09-12-25: Improved prompt - sequential assignment, ignore code_action matching
const SYNC_SYSTEM_PROMPT = `You are a Playwright Script Annotator. Your ONLY job is to add step metadata comments.

CRITICAL INSTRUCTION:
Do NOT try to match code_actions from the manifest. Instead, simply:
1. Find ALL executable lines (lines with "await page." or "await expect")
2. Add step annotations in SEQUENTIAL order: step 1 before first action, step 2 before second action, etc.

INPUTS PROVIDED:
- ORIGINAL_SCRIPT: The Playwright test to annotate
- DURATION_MAP: Maps step numbers to audio durations in milliseconds
- MANIFEST: Ignore the code_action field. Only use step_id and duration.

ALGORITHM:
1. Read the script top to bottom
2. Count executable actions (await page.*, await expect.*)
3. Before action #1, add: // __STEP_META__: {"stepId": 1, "audioDuration": <duration from map>}
4. Before action #2, add: // __STEP_META__: {"stepId": 2, "audioDuration": <duration from map>}
5. Continue until all actions are annotated or you run out of step_ids

CORRECT OUTPUT EXAMPLE:
import { test, expect } from '@playwright/test';

test('Example', async ({ page }) => {
  // __STEP_META__: {"stepId": 1, "audioDuration": 3500}
  await page.goto('https://example.com');

  // __STEP_META__: {"stepId": 2, "audioDuration": 2800}
  await page.locator('#user').fill('test');

  // __STEP_META__: {"stepId": 3, "audioDuration": 1500}
  await page.locator('#btn').click();

  // __STEP_META__: {"stepId": 4, "audioDuration": 2000}
  await expect(page).toHaveURL('/dashboard');
});

WRONG - Out of order (NEVER do this):
// __STEP_META__: {"stepId": 1, ...}
await page.goto(...);
// __STEP_META__: {"stepId": 14, ...}  <-- WRONG! Should be stepId: 2
await page.fill(...);

RULES:
1. stepId MUST go 1, 2, 3, 4, 5... in order. NEVER skip or jump.
2. ONE annotation per action. Never put two annotations before one action.
3. Keep all original code exactly as-is.
4. Use {"stepId": N} format with double quotes.
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
  // Sort manifest by step_id and create a simple duration lookup
  const sortedManifest = [...manifest].sort((a, b) => a.step_id - b.step_id);
  
  const prompt = `ORIGINAL_SCRIPT:
\`\`\`typescript
${originalScript}
\`\`\`

DURATION_MAP (step number -> audio duration in ms):
${JSON.stringify(durationMap, null, 2)}

NUMBER OF STEPS: ${sortedManifest.length}

INSTRUCTIONS:
1. Find each "await page." or "await expect" line in the script (top to bottom)
2. Before the 1st action, add: // __STEP_META__: {"stepId": 1, "audioDuration": ${durationMap[1] || 2000}}
3. Before the 2nd action, add: // __STEP_META__: {"stepId": 2, "audioDuration": ${durationMap[2] || 2000}}
4. Continue sequentially: 1, 2, 3, 4, 5... until step ${sortedManifest.length}
5. NEVER use stepId 14 before stepId 2, 3, 4, etc. Order must be sequential!

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

// Generate a synchronized script with step metadata for post-recording audio muxing
function generateMockSyncedScript(
  originalScript: string | null,
  durationMap: Record<number, number>,
  manifest: Array<{ step_id: number; code_action: string; narration: string }>,
  projectId: string
): string {
  // Generate step metadata comments instead of audio playback/waitForTimeout
  // Audio will be muxed after recording based on timestamps
  const stepsCode = manifest.map((step) => {
    const audioDuration = durationMap[step.step_id] || 2000;
    const codeAction = step.code_action.startsWith('await') 
      ? step.code_action 
      : `await ${step.code_action}`;
    
    return `  // __STEP_META__: { stepId: ${step.step_id}, audioDuration: ${audioDuration} }
  ${codeAction};`;
  }).join('\n\n');

  const playwrightTemplate = `import { test, expect } from '@playwright/test';

/**
 * Synchronized Video Recording Script - Project ${projectId}
 * 
 * This script uses __STEP_META__ comments to mark steps for audio synchronization.
 * Audio is muxed AFTER recording based on actual step execution timestamps.
 * 
 * Format: // __STEP_META__: { stepId: N, audioDuration: Nms }
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
