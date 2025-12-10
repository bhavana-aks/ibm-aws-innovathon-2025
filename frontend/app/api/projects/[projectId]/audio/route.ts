// 07-12-25: Created audio generation API endpoint using Amazon Polly
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PollyClient, SynthesizeSpeechCommand, VoiceId, Engine, OutputFormat } from '@aws-sdk/client-polly';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_AWS_REGION || 'us-east-1' })
);

const s3Client = new S3Client({ region: process.env.APP_AWS_REGION || 'us-east-1' });

const pollyClient = new PollyClient({ region: process.env.APP_AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';

// Available Polly voices for narration
const VOICE_OPTIONS: Record<string, VoiceId> = {
  matthew: 'Matthew',    // Male, US English, Neural
  joanna: 'Joanna',      // Female, US English, Neural
  ivy: 'Ivy',            // Female, US English (child)
  kendra: 'Kendra',      // Female, US English
  kimberly: 'Kimberly',  // Female, US English
  salli: 'Salli',        // Female, US English
  joey: 'Joey',          // Male, US English
  justin: 'Justin',      // Male, US English (child)
  brian: 'Brian',        // Male, British English
  amy: 'Amy',            // Female, British English
};

// Simple MP3 duration estimation (approximate)
// For production, use ffprobe or a proper audio library
function estimateDurationFromText(text: string): number {
  // Average speaking rate: ~150 words per minute
  // Average word length: ~5 characters
  const wordsPerMinute = 150;
  const avgCharsPerWord = 5;
  const wordCount = text.length / avgCharsPerWord;
  const durationMinutes = wordCount / wordsPerMinute;
  return Math.round(durationMinutes * 60 * 1000); // Convert to milliseconds
}

// More accurate duration calculation from audio buffer
function calculateDurationFromMp3(audioBuffer: Uint8Array): number {
  // MP3 frame duration approximation
  // For a more accurate calculation, we'd need to parse MP3 frames
  // This is a reasonable estimate based on bitrate
  // Polly outputs at 22050 Hz sample rate, ~48kbps for MP3
  const bitrate = 48000; // bits per second (approximate for Polly MP3)
  const durationSeconds = (audioBuffer.length * 8) / bitrate;
  return Math.round(durationSeconds * 1000); // Convert to milliseconds
}

async function generateAudioForStep(
  stepId: number,
  narration: string,
  projectId: string,
  tenantId: string,
  voiceId: VoiceId = 'Matthew'
): Promise<{ s3Key: string; durationMs: number }> {
  // Generate speech using Polly
  const pollyCommand = new SynthesizeSpeechCommand({
    Engine: 'neural',
    OutputFormat: 'mp3',
    Text: narration,
    VoiceId: voiceId,
    TextType: 'text',
  });

  const pollyResponse = await pollyClient.send(pollyCommand);
  
  if (!pollyResponse.AudioStream) {
    throw new Error('No audio stream returned from Polly');
  }

  // Convert stream to buffer
  const audioBuffer = await pollyResponse.AudioStream.transformToByteArray();
  
  // Calculate duration from the audio
  const durationMs = calculateDurationFromMp3(audioBuffer);

  // Generate S3 key with tenant isolation
  const cleanTenantId = tenantId.replace('TENANT#', '');
  const s3Key = `audio/${cleanTenantId}/${projectId}/step_${stepId}.mp3`;

  // Upload to S3
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
    Metadata: {
      'project-id': projectId,
      'step-id': String(stepId),
      'duration-ms': String(durationMs),
    },
  }));

  return { s3Key, durationMs };
}

// Mock audio generation for development
function generateMockAudio(
  stepId: number,
  narration: string,
  projectId: string,
  tenantId: string
): { s3Key: string; durationMs: number } {
  const cleanTenantId = tenantId.replace('TENANT#', '');
  const s3Key = `audio/${cleanTenantId}/${projectId}/step_${stepId}.mp3`;
  const durationMs = estimateDurationFromText(narration);
  
  return { s3Key, durationMs };
}

// POST /api/projects/[projectId]/audio - Generate audio for all steps
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { voiceId = 'matthew' } = body;

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

    if (!project.manifest || !Array.isArray(project.manifest) || project.manifest.length === 0) {
      return NextResponse.json(
        { error: 'Project has no manifest. Generate script first.' },
        { status: 400 }
      );
    }

    if (project.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Project must be in APPROVED status to generate audio.' },
        { status: 400 }
      );
    }

    // Update status to AUDIO_GENERATING
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #audioProgress = :audioProgress, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#audioProgress': 'audioProgress',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'AUDIO_GENERATING',
        ':audioProgress': {
          total: project.manifest.length,
          completed: 0,
          currentStep: project.manifest[0]?.step_id || 1,
        },
        ':updatedAt': new Date().toISOString(),
      },
    }));

    const selectedVoice = VOICE_OPTIONS[voiceId.toLowerCase()] || 'Matthew';
    const useMock = !process.env.APP_AWS_ACCESS_KEY_ID || 
                   process.env.USE_MOCK_POLLY === 'true' ||
                   !S3_BUCKET;

    const results: Array<{ stepId: number; s3Key: string; durationMs: number }> = [];
    const durationMap: Record<number, number> = {};
    const updatedManifest = [...project.manifest];

    // Process each step sequentially (could be parallelized for production)
    for (let i = 0; i < project.manifest.length; i++) {
      const step = project.manifest[i];
      
      try {
        let audioResult: { s3Key: string; durationMs: number };

        if (useMock) {
          console.log(`Mock audio generation for step ${step.step_id}`);
          audioResult = generateMockAudio(step.step_id, step.narration, projectId, formattedTenantId);
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.log(`Generating audio for step ${step.step_id} using Polly`);
          audioResult = await generateAudioForStep(
            step.step_id,
            step.narration,
            projectId,
            formattedTenantId,
            selectedVoice
          );
        }

        results.push({
          stepId: step.step_id,
          s3Key: audioResult.s3Key,
          durationMs: audioResult.durationMs,
        });

        durationMap[step.step_id] = audioResult.durationMs;

        // Update the manifest step with audio info
        updatedManifest[i] = {
          ...step,
          audioS3Key: audioResult.s3Key,
          durationMs: audioResult.durationMs,
          audioGenerated: true,
        };

        // Update progress in DynamoDB
        await dynamoClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: formattedTenantId,
            SK: `PROJ#${projectId}`,
          },
          UpdateExpression: 'SET #audioProgress = :audioProgress, #manifest = :manifest, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#audioProgress': 'audioProgress',
            '#manifest': 'manifest',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':audioProgress': {
              total: project.manifest.length,
              completed: i + 1,
              currentStep: i < project.manifest.length - 1 ? project.manifest[i + 1].step_id : step.step_id,
            },
            ':manifest': updatedManifest,
            ':updatedAt': new Date().toISOString(),
          },
        }));

      } catch (stepError) {
        console.error(`Error generating audio for step ${step.step_id}:`, stepError);
        
        // Update status to ERROR
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
            ':errorMessage': `Failed to generate audio for step ${step.step_id}: ${stepError instanceof Error ? stepError.message : 'Unknown error'}`,
            ':updatedAt': new Date().toISOString(),
          },
        }));

        return NextResponse.json(
          { error: `Failed to generate audio for step ${step.step_id}` },
          { status: 500 }
        );
      }
    }

    // Update project with final audio data
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #manifest = :manifest, #durationMap = :durationMap, #audioProgress = :audioProgress, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#manifest': 'manifest',
        '#durationMap': 'durationMap',
        '#audioProgress': 'audioProgress',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'AUDIO_COMPLETE',
        ':manifest': updatedManifest,
        ':durationMap': durationMap,
        ':audioProgress': {
          total: project.manifest.length,
          completed: project.manifest.length,
        },
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Calculate total duration
    const totalDurationMs = Object.values(durationMap).reduce((sum, dur) => sum + dur, 0);

    return NextResponse.json({
      message: 'Audio generated successfully',
      projectId,
      audioFiles: results,
      durationMap,
      totalDurationMs,
      totalDurationFormatted: formatDuration(totalDurationMs),
    });
  } catch (error) {
    console.error('Error generating audio:', error);
    return NextResponse.json(
      { error: 'Failed to generate audio' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[projectId]/audio - Get audio generation status
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

    return NextResponse.json({
      status: project.status,
      audioProgress: project.audioProgress || null,
      durationMap: project.durationMap || null,
      manifest: project.manifest || [],
    });
  } catch (error) {
    console.error('Error fetching audio status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audio status' },
      { status: 500 }
    );
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
