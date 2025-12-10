// 07-12-25: Created script approval API endpoint
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);

const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';

// POST /api/projects/[projectId]/approve - Approve script and trigger rendering
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { manifest } = body;

    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    if (!manifest || !Array.isArray(manifest)) {
      return NextResponse.json(
        { error: 'Valid manifest array is required' },
        { status: 400 }
      );
    }

    // Get current project to check task token
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

    // Update project with approved manifest and status
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
        ':status': 'APPROVED',
        ':manifest': manifest,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // If there's a Step Functions task token, send success to continue the workflow
    if (project.taskToken) {
      try {
        await sfnClient.send(new SendTaskSuccessCommand({
          taskToken: project.taskToken,
          output: JSON.stringify({
            projectId,
            manifest,
            status: 'APPROVED',
          }),
        }));
        console.log('Step Functions task success sent');
      } catch (sfnError) {
        console.warn('Failed to send Step Functions task success:', sfnError);
        // Don't fail the request if Step Functions callback fails
      }
    }

    // TODO: In Phase 4, this will trigger the audio generation workflow
    // For now, we just update the status to APPROVED

    return NextResponse.json({ 
      message: 'Script approved successfully',
      projectId,
      status: 'APPROVED',
    });
  } catch (error) {
    console.error('Error approving script:', error);
    return NextResponse.json(
      { error: 'Failed to approve script' },
      { status: 500 }
    );
  }
}



