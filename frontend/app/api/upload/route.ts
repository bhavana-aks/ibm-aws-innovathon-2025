// 15-01-25: Added better error handling for presigned URL generation
// 10-12-25: Use default credential chain for Amplify IAM role support
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

const s3Client = new S3Client(clientConfig);

const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

export async function POST(request: NextRequest) {
  try {
    if (!BUCKET_NAME) {
      return NextResponse.json(
        { error: 'S3_BUCKET_NAME environment variable is not set' },
        { status: 500 }
      );
    }

    const { fileName, fileType } = await request.json();
    
    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'fileName and fileType are required' },
        { status: 400 }
      );
    }

    const fileKey = `lib/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ uploadUrl, fileKey });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate upload URL', details: errorMessage },
      { status: 500 }
    );
  }
}


