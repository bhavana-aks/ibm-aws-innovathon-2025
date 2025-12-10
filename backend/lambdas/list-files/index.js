// 15-01-25: Created Lambda function for listing files with tenant filtering
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);

const TABLE_NAME = process.env.TABLE_NAME || 'VideoSaaS';

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract tenant_id from Cognito authorizer context
    // API Gateway passes this in event.requestContext.authorizer.claims
    const tenantId = event.requestContext?.authorizer?.claims?.['custom:tenant_id'] ||
                     event.requestContext?.authorizer?.claims?.tenant_id ||
                     event.headers?.['x-tenant-id']; // Fallback for testing

    if (!tenantId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Unauthorized: tenant_id not found' }),
      };
    }

    // Query DynamoDB for files belonging to this tenant
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': tenantId,
        ':skPrefix': 'FILE#',
      },
    });

    const result = await dynamoClient.send(command);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        files: result.Items || [],
        count: result.Count || 0,
      }),
    };
  } catch (error) {
    console.error('Error listing files:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error', details: error.message }),
    };
  }
};




