// 07-12-25: Added Phase 4 fields (audioProgress, durationMap, syncedScriptS3Key)
// 07-12-25: Created project detail API for fetching and updating projects
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.APP_AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';

// GET /api/projects/[projectId] - Get project details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
    });

    const result = await docClient.send(command);

    if (!result.Item) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const project = {
      id: result.Item.SK.replace('PROJ#', ''),
      tenantId: result.Item.PK,
      name: result.Item.name,
      status: result.Item.status,
      userPrompt: result.Item.userPrompt,
      selectedFiles: result.Item.selectedFiles || [],
      manifest: result.Item.manifest,
      taskToken: result.Item.taskToken,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt,
      errorMessage: result.Item.errorMessage,
      // Phase 4 fields
      audioProgress: result.Item.audioProgress,
      durationMap: result.Item.durationMap,
      syncedScriptS3Key: result.Item.syncedScriptS3Key,
    };

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId] - Update project (e.g., save manifest draft)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { manifest, status } = body;

    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': new Date().toISOString(),
    };

    if (manifest) {
      updateExpressions.push('#manifest = :manifest');
      expressionAttributeNames['#manifest'] = 'manifest';
      expressionAttributeValues[':manifest'] = manifest;
    }

    if (status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);

    return NextResponse.json({ 
      message: 'Project updated successfully',
      project: result.Attributes,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
