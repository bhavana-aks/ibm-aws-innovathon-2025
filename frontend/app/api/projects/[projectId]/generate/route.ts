// 07-12-25: Created script generation API endpoint (Bedrock integration)
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';

// The "Mega-Prompt" for script generation
const SYSTEM_PROMPT = `You are an expert Technical Video Director.

INPUTS:
1. USER_PROMPT: The user's directive for how to create the video
2. CONTEXT_DOCS: The PDF content (user guide documentation)
3. CODE_STEPS: List of Playwright actions from test scripts

YOUR GOAL:
Create a JSON manifest for a video narration.

RULES:
1. FILTERING: If USER_PROMPT says "skip" or "fast" for a section, write a very short, summary voiceover (e.g., "Log in quickly...").
2. FOCUS: If USER_PROMPT says "focus on X", write a detailed voiceover for those specific steps, referencing the CONTEXT_DOCS for explanation.
3. SYNC: Map every "narration" to a specific "code_step_id".
4. TONE: Adapt the writing style to match the USER_PROMPT (e.g., Professional vs. Casual).
5. LANGUAGE: Use natural, user-friendly language. DO NOT mention technical details like HTML selectors, attributes (e.g. data-test), or function names. Describe the user action instead (e.g. "Enter your password" instead of "Fill password field").
6. OUTPUT: Return ONLY a valid JSON array with no additional text.

OUTPUT FORMAT (JSON array):
[
  {
    "step_id": 1,
    "code_action": "click('#login')",
    "narration": "First, log in to the system.",
    "importance": "low"
  },
  {
    "step_id": 2,
    "code_action": "click('#submit')",
    "narration": "Here is the critical part. When you click submit without data, notice the red validation error.",
    "importance": "high"
  }
]

importance values: "low", "medium", or "high"`;

async function getFileContent(s3Key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body?.transformToString() || '';
    return content;
  } catch (error) {
    console.error(`Error fetching file ${s3Key}:`, error);
    return '';
  }
}

async function extractPlaywrightSteps(code: string): Promise<string[]> {
  // Simple extraction of Playwright actions from code
  const actionPatterns = [
    /page\.(click|fill|type|press|goto|check|uncheck|select|hover|focus)\s*\([^)]+\)/g,
    /await\s+page\.\w+\([^)]+\)/g,
    /expect\([^)]+\)\.\w+\([^)]*\)/g,
  ];

  const actions: string[] = [];
  for (const pattern of actionPatterns) {
    const matches = code.match(pattern) || [];
    actions.push(...matches);
  }

  // Deduplicate and limit
  return [...new Set(actions)].slice(0, 50);
}

async function generateScriptWithBedrock(
  userPrompt: string,
  contextDocs: string,
  codeSteps: string[]
): Promise<any[]> {
  const prompt = `USER_PROMPT: "${userPrompt}"

CONTEXT_DOCS:
${contextDocs.slice(0, 10000)}

CODE_STEPS:
${codeSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Generate the JSON manifest for this video narration. Return ONLY the JSON array.`;

  try {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
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
    
    // Extract the text content
    const textContent = responseBody.content?.[0]?.text || '';
    
    // Parse JSON from the response
    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('No valid JSON found in Bedrock response');
  } catch (error) {
    console.error('Bedrock invocation error:', error);
    throw error;
  }
}

// Generate a mock manifest for development/testing when Bedrock is not available
function generateMockManifest(codeSteps: string[]): any[] {
  const steps = codeSteps.length > 0 ? codeSteps : [
    "page.goto('https://example.com')",
    "page.click('#login-button')",
    "page.fill('#username', 'user@example.com')",
    "page.fill('#password', '********')",
    "page.click('#submit')",
    "page.click('#dashboard')",
    "page.click('#create-new')",
    "page.fill('#title', 'New Item')",
    "page.click('#save')",
  ];

  return steps.map((step, index) => ({
    step_id: index + 1,
    code_action: step,
    narration: `Step ${index + 1}: ${getNarrationForStep(step)}`,
    importance: index < 2 ? 'low' : index > steps.length - 3 ? 'high' : 'medium',
  }));
}

function getNarrationForStep(step: string): string {
  if (step.includes('goto')) return 'Navigate to the application homepage.';
  if (step.includes('login') || step.includes('Login')) return 'Click the login button to access the authentication page.';
  if (step.includes('username') || step.includes('email')) return 'Enter your username or email address in the input field.';
  if (step.includes('password')) return 'Enter your secure password.';
  if (step.includes('submit')) return 'Click submit to proceed with the action.';
  if (step.includes('dashboard')) return 'Navigate to the dashboard to view your overview.';
  if (step.includes('create') || step.includes('new')) return 'Click to create a new item.';
  if (step.includes('save')) return 'Save your changes.';
  if (step.includes('fill')) return 'Fill in the required information.';
  if (step.includes('click')) return 'Click to proceed with the next action.';
  return 'Perform this action as shown.';
}

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

    // Update status to GENERATING
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
        ':status': 'GENERATING',
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Get file details for selected files
    const selectedFileIds = project.selectedFiles || [];
    let contextDocs = '';
    let codeSteps: string[] = [];

    for (const fileId of selectedFileIds) {
      // Query to get file details
      const fileResult = await dynamoClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: formattedTenantId,
          SK: `FILE#${fileId}`,
        },
      }));

      if (fileResult.Item) {
        const s3Key = fileResult.Item.s3_key;
        const content = await getFileContent(s3Key);

        if (fileResult.Item.type === 'guide') {
          // PDF content - for MVP, we'll use the raw text
          // In production, use Textract for better extraction
          contextDocs += `\n\n--- ${fileResult.Item.name} ---\n${content}`;
        } else if (fileResult.Item.type === 'test') {
          // Playwright test file
          const steps = await extractPlaywrightSteps(content);
          codeSteps.push(...steps);
        }
      }
    }

    let manifest: any[];

    // Try to use Bedrock, fall back to mock if not configured
    const useMock = !process.env.AWS_ACCESS_KEY_ID || 
                   process.env.USE_MOCK_BEDROCK === 'true' ||
                   !S3_BUCKET;

    if (useMock) {
      console.log('Using mock manifest generation (Bedrock not configured)');
      manifest = generateMockManifest(codeSteps);
    } else {
      try {
        manifest = await generateScriptWithBedrock(
          project.userPrompt || 'Create a professional video tutorial.',
          contextDocs,
          codeSteps
        );
      } catch (bedrockError) {
        console.warn('Bedrock failed, falling back to mock:', bedrockError);
        manifest = generateMockManifest(codeSteps);
      }
    }

    // Update project with generated manifest
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #manifest = :manifest, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#manifest': 'manifest',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'REVIEW',
        ':manifest': manifest,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return NextResponse.json({ 
      message: 'Script generated successfully',
      manifest,
    });
  } catch (error) {
    console.error('Error generating script:', error);

    // Update project status to ERROR
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
          ':errorMessage': error instanceof Error ? error.message : 'Unknown error',
          ':updatedAt': new Date().toISOString(),
        },
      }));
    } catch (updateError) {
      console.error('Failed to update project status to ERROR:', updateError);
    }

    return NextResponse.json(
      { error: 'Failed to generate script' },
      { status: 500 }
    );
  }
}



