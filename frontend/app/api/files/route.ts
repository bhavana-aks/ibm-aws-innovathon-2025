// 07-12-25: Fixed POST to format tenantId with TENANT# prefix for consistency with GET
// 07-12-25: Added GET method for listing files
// 10-12-25: Use default credential chain for Amplify IAM role support
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Build credentials only if explicitly provided, otherwise use default chain
const clientConfig: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
  region: process.env.APP_AWS_REGION || 'us-east-1',
};

if (process.env.APP_AWS_ACCESS_KEY_ID && process.env.APP_AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY,
  };
}

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';

// GET /api/files - List all files for the tenant
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id') || 
                     request.nextUrl.searchParams.get('tenantId') || 
                     'TENANT#demo';

    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': formattedTenantId,
        ':sk': 'FILE#',
      },
    });

    const result = await dynamoClient.send(command);
    
    const files = (result.Items || []).map(item => ({
      id: item.SK.replace('FILE#', ''),
      name: item.name,
      type: item.type,
      s3Key: item.s3_key,
      fileType: item.fileType,
      uploadedAt: item.createdAt,
    }));

    // Sort by upload date (newest first)
    files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileKey, fileType, tenantId } = await request.json();

    if (!fileName || !fileKey || !fileType || !tenantId) {
      return NextResponse.json(
        { error: 'fileName, fileKey, fileType, and tenantId are required' },
        { status: 400 }
      );
    }

    // Format tenantId consistently with GET handler
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;

    const fileId = `FILE#${Date.now()}`;
    const fileTypeCategory = fileType.includes('pdf') ? 'guide' : 'test';

    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: formattedTenantId,
          SK: fileId,
          type: fileTypeCategory,
          s3_key: fileKey,
          name: fileName,
          fileType: fileType,
          createdAt: new Date().toISOString(),
        },
      })
    );

    return NextResponse.json({ success: true, fileId });
  } catch (error) {
    console.error('Error saving file metadata:', error);
    return NextResponse.json(
      { error: 'Failed to save file metadata' },
      { status: 500 }
    );
  }
}


