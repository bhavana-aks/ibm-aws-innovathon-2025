// 10-12-25: Fixed AWS credentials for Amplify Hosting Compute
// 10-12-25: Updated to enforce 1:1 manifest-script correspondence for audio sync
// 07-12-25: Created script generation API endpoint (Bedrock integration)
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Build AWS client config - use explicit credentials only if both are provided
// In Amplify Hosting Compute, the execution role provides credentials automatically
const getAwsClientConfig = () => {
  const config: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
    region: process.env.APP_AWS_REGION || 'us-east-1',
  };
  
  if (process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
    };
  }
  
  return config;
};

const awsConfig = getAwsClientConfig();
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const s3Client = new S3Client(awsConfig);
const bedrockClient = new BedrockRuntimeClient(awsConfig);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';

// 12-12-25: Updated prompt for natural, conversational demo-style narration
// 10-12-25: Updated prompt to let Bedrock extract actions and filter out setup steps
const SYSTEM_PROMPT = `You are an expert Technical Video Director and Playwright expert creating a guided demo video.

INPUTS:
1. USER_PROMPT: The user's directive for how to create the video
2. CONTEXT_DOCS: The PDF content (user guide documentation)  
3. RAW_SCRIPT: The complete Playwright test script

YOUR TASK:
1. FIRST: Extract only USER-FACING ACTIONS from the script (in order of appearance)
2. THEN: Create exactly ONE narration per action

ACTIONS TO INCLUDE (user-facing actions that should have narration):
- page.goto() - navigation to a URL
- page.click(), page.locator().click() - clicking buttons/links
- page.fill(), page.locator().fill() - filling form inputs
- page.type(), page.locator().type() - typing text
- expect() assertions - verifications the user should see
- page.check(), page.uncheck() - checkbox interactions
- page.selectOption() - dropdown selections

ACTIONS TO EXCLUDE (setup/utility - NO narration needed):
- page.setViewportSize() - viewport setup
- page.waitForTimeout() - artificial delays
- page.waitForLoadState() - page load waits
- page.waitForSelector() - element waits  
- page.screenshot() - screenshots
- console.log() - logging
- Any line inside test setup/teardown hooks

CRITICAL RULES:
1. Extract the EXACT code line from the script for code_action (include "await" if present)
2. Do NOT create "transition" narrations like "The page has loaded" or "The site is now ready"
3. Do NOT invent actions - only use what exists in the script
4. step_id starts at 1 and increments for each included action
5. Order must match the script execution order

NARRATION STYLE - THIS IS CRITICAL:
You are narrating like a friendly guide giving a live demo to someone. The narration should:
1. Sound CONVERSATIONAL and NATURAL - like you're walking someone through the app in person
2. Use SECOND PERSON ("you/your") - you're guiding the viewer
3. NEVER read out exact values like "enter admin as username" or "type password123"
4. Instead, use generic references: "enter your username", "type in your password"
5. Use transitional phrases naturally: "Now...", "Next...", "Go ahead and...", "Once that's done..."
6. Group related actions mentally - login is ONE concept, not "enter username, enter password, click button"
7. Keep it brief but warm - 1-2 short sentences max
8. NEVER mention technical selectors, IDs, classes, or data attributes

BAD (robotic) examples - DO NOT write like this:
- "Enter admin in the username field."
- "Fill password123 in the password input."
- "Click on the login button."
- "Navigate to https://example.com/dashboard."

GOOD (conversational) examples - Write like this:
- "Go ahead and log in with your credentials."
- "Enter your username here."
- "Now type in your password."
- "Click the login button to continue."
- "Let's head over to the dashboard."
- "You'll notice the cart icon in the top right - click on that."
- "Perfect! Now fill in your shipping details."
- "Once you're ready, hit that checkout button."

OUTPUT FORMAT (JSON array only, no other text):
[
  {
    "step_id": 1,
    "code_action": "await page.goto('https://example.com')",
    "narration": "Let's start by opening the application.",
    "importance": "low"
  },
  {
    "step_id": 2,
    "code_action": "await page.locator('[data-test=\"username\"]').fill('admin')",
    "narration": "Go ahead and enter your username.",
    "importance": "medium"
  },
  {
    "step_id": 3,
    "code_action": "await page.locator('[data-test=\"password\"]').fill('secret123')",
    "narration": "Now type in your password.",
    "importance": "medium"
  },
  {
    "step_id": 4,
    "code_action": "await page.locator('[data-test=\"login-btn\"]').click()",
    "narration": "Click the login button to sign in.",
    "importance": "medium"
  }
]

importance: "low" (setup/navigation), "medium" (main flow), "high" (critical actions/verifications)`;

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

/**
 * Extract Playwright actions from code in ORDER
 * Returns actions in the order they appear in the script
 */
async function extractPlaywrightSteps(code: string): Promise<string[]> {
  const lines = code.split('\n');
  const actions: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines, comments, and non-action lines
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }
    
    // Match page actions (in order of appearance) - exclude setup actions
    if (trimmedLine.match(/await\s+page\.(goto|click|fill|type|press|check|uncheck|select|hover|focus|locator)\s*\(/)) {
      // Clean up the action - extract the meaningful part
      const actionMatch = trimmedLine.match(/await\s+(page\.[^;]+)/);
      if (actionMatch) {
        actions.push(actionMatch[1].replace(/;?\s*$/, ''));
      }
    }
    // Match expect assertions
    else if (trimmedLine.match(/await\s+expect\s*\(/)) {
      const expectMatch = trimmedLine.match(/await\s+(expect\([^;]+)/);
      if (expectMatch) {
        actions.push(expectMatch[1].replace(/;?\s*$/, ''));
      }
    }
  }

  // Limit but preserve order
  return actions.slice(0, 50);
}

async function generateScriptWithBedrock(
  userPrompt: string,
  contextDocs: string,
  rawScript: string
): Promise<any[]> {
  const prompt = `USER_PROMPT: "${userPrompt}"

CONTEXT_DOCS:
${contextDocs.slice(0, 8000)}

RAW_SCRIPT:
\`\`\`typescript
${rawScript}
\`\`\`

TASK:
1. Read the RAW_SCRIPT and identify all USER-FACING actions (goto, click, fill, expect, etc.)
2. EXCLUDE setup actions like setViewportSize, waitForTimeout, waitForLoadState
3. Create a manifest entry for EACH user-facing action with a natural narration
4. Return ONLY the JSON array, no other text.`;

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

/**
 * Generate narration for a specific Playwright action
 * 12-12-25: Updated to use natural, conversational demo-style language
 * This maps each action type to a user-friendly description
 */
function getNarrationForStep(step: string, stepIndex: number): string {
  const lowerStep = step.toLowerCase();
  
  // Transitional phrases to make narration flow naturally
  const transitions = ['Now', 'Next', 'Go ahead and', 'Then', ''];
  const transition = stepIndex === 0 ? "Let's start by" : transitions[stepIndex % transitions.length];
  const addTransition = (text: string) => transition ? `${transition} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
  
  // Navigation
  if (lowerStep.includes('goto')) {
    if (stepIndex === 0) return "Let's open up the application.";
    if (lowerStep.includes('inventory')) return addTransition('Head over to the inventory page.');
    if (lowerStep.includes('cart')) return addTransition('Navigate to your cart.');
    if (lowerStep.includes('checkout')) return addTransition('Move on to the checkout page.');
    return addTransition('Navigate to the next page.');
  }
  
  // Login-related
  if (lowerStep.includes('username')) return addTransition('Enter your username here.');
  if (lowerStep.includes('password')) return addTransition('Type in your password.');
  if (lowerStep.includes('login-button') || (lowerStep.includes('click') && lowerStep.includes('login'))) {
    return addTransition('Click the login button to sign in.');
  }
  
  // Cart and checkout flow
  if (lowerStep.includes('add-to-cart') || lowerStep.includes('add_to_cart')) {
    return addTransition('Add this item to your cart.');
  }
  if (lowerStep.includes('shopping_cart') || lowerStep.includes('cart_link') || lowerStep.includes('cart_icon')) {
    return addTransition("Click on the cart icon to see what you've added.");
  }
  if (lowerStep.includes('checkout') && lowerStep.includes('click')) {
    return addTransition('Proceed to checkout.');
  }
  if (lowerStep.includes('firstname') || lowerStep.includes('first-name')) {
    return addTransition('Fill in your first name.');
  }
  if (lowerStep.includes('lastname') || lowerStep.includes('last-name')) {
    return addTransition('Enter your last name.');
  }
  if (lowerStep.includes('postalcode') || lowerStep.includes('postal-code') || lowerStep.includes('zip')) {
    return addTransition('Add your postal code.');
  }
  if (lowerStep.includes('continue')) return addTransition('Click continue to move forward.');
  if (lowerStep.includes('finish')) return "Perfect! Click finish to complete your order.";
  
  // Assertions - make these sound like observations
  if (lowerStep.includes('expect')) {
    if (lowerStep.includes('tohaveurl') && lowerStep.includes('inventory')) {
      return "Great - you should now see the inventory page.";
    }
    if (lowerStep.includes('tohavetext')) {
      if (lowerStep.includes('thank you') || lowerStep.includes('complete')) {
        return "And there's your confirmation! The order is complete.";
      }
      return "Notice how the text updates on screen.";
    }
    if (lowerStep.includes('cart_badge') || lowerStep.includes('shopping_cart_badge')) {
      return "You can see the cart has updated with your items.";
    }
    return "Take a moment to see the result.";
  }
  
  // Generic actions with natural phrasing
  if (lowerStep.includes('fill')) return addTransition('Fill in this field.');
  if (lowerStep.includes('click')) return addTransition('Click here to continue.');
  if (lowerStep.includes('select')) return addTransition('Select an option from the dropdown.');
  if (lowerStep.includes('check')) return addTransition('Check this option.');
  if (lowerStep.includes('type')) return addTransition('Type in the required information.');
  
  return addTransition('Complete this step.');
}

/**
 * Generate a mock manifest for development/testing when Bedrock is not available
 * Creates exactly ONE manifest entry per code step (1:1 correspondence)
 */
function generateMockManifest(codeSteps: string[]): any[] {
  // Default steps if none provided
  const steps = codeSteps.length > 0 ? codeSteps : [
    "page.goto('https://www.saucedemo.com/')",
    "page.locator('[data-test=\"username\"]').fill('standard_user')",
    "page.locator('[data-test=\"password\"]').fill('secret_sauce')",
    "page.locator('[data-test=\"login-button\"]').click()",
    "expect(page).toHaveURL(/.*inventory.html/)",
  ];

  // Filter out non-action steps like setViewportSize and waitForTimeout
  const actionSteps = steps.filter(step => {
    const lowerStep = step.toLowerCase();
    // Keep meaningful actions, filter out setup/utility calls
    return !lowerStep.includes('setviewportsize') && 
           !lowerStep.includes('waitfortimeout');
  });

  // Generate 1:1 manifest entries with conversational narration
  return actionSteps.map((step, index) => ({
    step_id: index + 1,
    code_action: step,
    narration: getNarrationForStep(step, index),
    importance: index < 2 ? 'low' : index > actionSteps.length - 3 ? 'high' : 'medium',
  }));
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
    let rawScriptContent = '';  // Store raw script for Bedrock
    let codeSteps: string[] = [];  // Extracted steps for mock fallback

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
          // Store raw script for Bedrock to analyze
          rawScriptContent = content;
          // Also extract steps for mock fallback
          const steps = await extractPlaywrightSteps(content);
          codeSteps.push(...steps);
        }
      }
    }

    let manifest: any[];

    // Try to use Bedrock, fall back to mock if not configured
    const useMock = !process.env.APP_AWS_ACCESS_KEY_ID || 
                   process.env.USE_MOCK_BEDROCK === 'true' ||
                   !S3_BUCKET;

    if (useMock) {
      console.log('Using mock manifest generation (Bedrock not configured)');
      manifest = generateMockManifest(codeSteps);
    } else {
      try {
        // Pass raw script to Bedrock for intelligent action extraction
        console.log('Using Bedrock for intelligent action extraction from script');
        manifest = await generateScriptWithBedrock(
          project.userPrompt || 'Create a professional video tutorial.',
          contextDocs,
          rawScriptContent || codeSteps.join('\n')  // Fallback to extracted steps if no raw script
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



