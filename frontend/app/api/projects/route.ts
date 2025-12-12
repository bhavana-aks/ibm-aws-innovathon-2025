// 10-12-25: Fixed AWS credentials for Amplify Hosting Compute
// 07-12-25: Created projects API for listing and creating projects
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Build DynamoDB client config
// In Amplify Hosting Compute, credentials come from the execution role automatically
// Only use explicit credentials if both are provided (for local dev)
const getDynamoDBConfig = () => {
  const config: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
    region: process.env.APP_AWS_REGION || 'us-east-1',
  };
  
  // Only add explicit credentials if BOTH are provided (local development)
  // In Amplify Hosting, the execution role provides credentials automatically
  if (process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
    };
    console.log('Using explicit AWS credentials');
  } else {
    console.log('Using default credential chain (IAM role)');
  }
  
  return config;
};

const client = new DynamoDBClient(getDynamoDBConfig());

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';

// GET /api/projects - List all projects for the tenant
export async function GET(request: NextRequest) {
  try {
    // Get tenant ID from headers or query params (in production, extract from auth token)
    const tenantId = request.headers.get('x-tenant-id') || 
                     request.nextUrl.searchParams.get('tenantId') || 
                     'TENANT#demo';

    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': formattedTenantId,
        ':sk': 'PROJ#',
      },
    });

    const result = await docClient.send(command);
    
    const projects = (result.Items || []).map(item => ({
      id: item.SK.replace('PROJ#', ''),
      tenantId: item.PK,
      name: item.name,
      status: item.status,
      userPrompt: item.userPrompt,
      selectedFiles: item.selectedFiles || [],
      manifest: item.manifest,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      errorMessage: item.errorMessage,
    }));

    // Sort by creation date (newest first)
    projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, userPrompt, selectedFiles } = body;

    if (!name || !selectedFiles || selectedFiles.length === 0) {
      return NextResponse.json(
        { error: 'Name and at least one file are required' },
        { status: 400 }
      );
    }

    // Get tenant ID from headers (in production, extract from auth token)
    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const projectId = uuidv4();
    const now = new Date().toISOString();

    const project = {
      PK: formattedTenantId,
      SK: `PROJ#${projectId}`,
      name,
      status: 'DRAFT',
      userPrompt: userPrompt || 'Create a professional video tutorial.',
      selectedFiles,
      createdAt: now,
      updatedAt: now,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: project,
    });

    await docClient.send(command);

    // Trigger script generation (fire-and-forget)
    // Don't await - let the generate route run asynchronously
    // The frontend will poll for status updates
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`;
    fetch(`${baseUrl}/api/projects/${projectId}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': formattedTenantId,
      },
    }).catch(err => {
      console.warn('Failed to trigger script generation:', err);
    });

    return NextResponse.json({ 
      projectId,
      message: 'Project created successfully. Script generation started.',
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}



