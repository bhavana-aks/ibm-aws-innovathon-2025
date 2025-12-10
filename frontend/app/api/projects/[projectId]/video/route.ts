// 08-12-25: Fix video file extension handling - support both mp4 and webm
// 07-12-25: Created video recording API endpoint for Phase 5
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ECSClient, RunTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_AWS_REGION || 'us-east-1' })
);

const ecsClient = new ECSClient({ region: process.env.APP_AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.APP_AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';
const ECS_CLUSTER = process.env.ECS_CLUSTER_NAME || 'video-saas-cluster';
const ECS_TASK_DEFINITION = process.env.ECS_TASK_FAMILY || 'video-saas-recorder';
const ECS_SUBNETS = process.env.ECS_SUBNETS?.split(',').filter(s => s.trim()) || [];
const ECS_SECURITY_GROUPS = process.env.ECS_SECURITY_GROUPS?.split(',').filter(s => s.trim()) || [];

// Debug logging
console.log('=== ECS Config Debug ===');
console.log('S3_BUCKET:', S3_BUCKET ? 'SET' : 'EMPTY');
console.log('ECS_SUBNETS:', ECS_SUBNETS.length, ECS_SUBNETS);
console.log('ECS_SECURITY_GROUPS:', ECS_SECURITY_GROUPS.length, ECS_SECURITY_GROUPS);
console.log('========================');

interface VideoGenerationRequest {
  useSimpleRecording?: boolean;
}

// POST /api/projects/[projectId]/video - Start video recording
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body: VideoGenerationRequest = await request.json().catch(() => ({}));
    const { useSimpleRecording = true } = body;

    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;
    const cleanTenantId = formattedTenantId.replace('TENANT#', '');

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

    // Validate project status
    if (project.status !== 'RENDERING') {
      return NextResponse.json(
        { error: `Project must be in RENDERING status. Current status: ${project.status}` },
        { status: 400 }
      );
    }

    if (!project.syncedScriptS3Key) {
      return NextResponse.json(
        { error: 'Synced script not found. Please complete script synchronization first.' },
        { status: 400 }
      );
    }

    // Update status to VIDEO_GENERATING
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #status = :status, #videoProgress = :videoProgress, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#videoProgress': 'videoProgress',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'VIDEO_GENERATING',
        ':videoProgress': {
          stage: 'STARTING',
          startedAt: new Date().toISOString(),
        },
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // Prepare environment variables for ECS task
    const audioS3Prefix = `audio/${cleanTenantId}/${projectId}/`;
    const outputVideoS3Key = `videos/${cleanTenantId}/${projectId}/recording.mp4`;

    // Check if we should use mock mode (no ECS configured)
    const useMock = !ECS_SUBNETS.length || 
                   !ECS_SECURITY_GROUPS.length || 
                   process.env.USE_MOCK_VIDEO === 'true' ||
                   !S3_BUCKET;

    if (useMock) {
      console.log('Using mock video generation (ECS not configured)');
      
      // Simulate video generation
      await simulateVideoGeneration(formattedTenantId, projectId, outputVideoS3Key);
      
      return NextResponse.json({
        message: 'Video generation started (mock mode)',
        projectId,
        status: 'VIDEO_GENERATING',
        mock: true,
      });
    }

    // Launch ECS Fargate task
    console.log('Launching ECS Fargate task for video recording...');
    
    const runTaskResult = await ecsClient.send(new RunTaskCommand({
      cluster: ECS_CLUSTER,
      taskDefinition: ECS_TASK_DEFINITION,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: ECS_SUBNETS,
          securityGroups: ECS_SECURITY_GROUPS,
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: 'video-recorder',
            environment: [
              { name: 'PROJECT_ID', value: projectId },
              { name: 'TENANT_ID', value: cleanTenantId },
              { name: 'S3_BUCKET', value: S3_BUCKET },
              { name: 'SYNCED_SCRIPT_S3_KEY', value: project.syncedScriptS3Key },
              { name: 'AUDIO_S3_PREFIX', value: audioS3Prefix },
              { name: 'OUTPUT_VIDEO_S3_KEY', value: outputVideoS3Key },
              { name: 'USE_SIMPLE_RECORDING', value: String(useSimpleRecording) },
            ],
          },
        ],
      },
    }));

    const taskArn = runTaskResult.tasks?.[0]?.taskArn;
    
    if (!taskArn) {
      throw new Error('Failed to start ECS task');
    }

    console.log(`ECS task started: ${taskArn}`);

    // Update project with task ARN
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: formattedTenantId,
        SK: `PROJ#${projectId}`,
      },
      UpdateExpression: 'SET #videoProgress = :videoProgress, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#videoProgress': 'videoProgress',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':videoProgress': {
          stage: 'RUNNING',
          taskArn,
          startedAt: new Date().toISOString(),
        },
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return NextResponse.json({
      message: 'Video generation started',
      projectId,
      taskArn,
      status: 'VIDEO_GENERATING',
    });

  } catch (error) {
    console.error('Error starting video generation:', error);
    
    // Try to update status to ERROR
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
          ':errorMessage': error instanceof Error ? error.message : 'Video generation failed',
          ':updatedAt': new Date().toISOString(),
        },
      }));
    } catch (updateError) {
      console.error('Failed to update project status to ERROR:', updateError);
    }

    return NextResponse.json(
      { error: 'Failed to start video generation' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[projectId]/video - Get video status and URL
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const tenantId = request.headers.get('x-tenant-id') || 'TENANT#demo';
    const formattedTenantId = tenantId.startsWith('TENANT#') ? tenantId : `TENANT#${tenantId}`;
    const cleanTenantId = formattedTenantId.replace('TENANT#', '');

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

    // If video is complete, generate a signed URL
    let videoUrl = null;
    let actualVideoS3Key = project.videoS3Key;
    if (project.status === 'COMPLETE' && S3_BUCKET) {
      // Try to find the video with different extensions (Playwright records webm)
      const possibleKeys = project.videoS3Key 
        ? [
            project.videoS3Key,
            project.videoS3Key.replace(/\.mp4$/, '.webm'),
            project.videoS3Key.replace(/\.webm$/, '.mp4'),
          ]
        : [
            `videos/${cleanTenantId}/${projectId}/recording.webm`,
            `videos/${cleanTenantId}/${projectId}/recording.mp4`,
          ];
      
      for (const key of possibleKeys) {
        try {
          // Check if the file exists by doing a head request
          await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
          }));
          
          // File exists, generate signed URL
          const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
          });
          videoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
          actualVideoS3Key = key;
          console.log(`Found video at: ${key}`);
          break;
        } catch {
          // File doesn't exist at this key, try next
        }
      }
      
      if (!videoUrl) {
        console.warn('Could not find video file in S3');
      }
    }

    // Check ECS task status if VIDEO_GENERATING
    let taskStatus = null;
    if (project.status === 'VIDEO_GENERATING') {
      // First, check if video file already exists in S3 (could have been uploaded by ECS task)
      if (S3_BUCKET) {
        const possibleKeys = [
          `videos/${cleanTenantId}/${projectId}/recording.webm`,
          `videos/${cleanTenantId}/${projectId}/recording.mp4`,
        ];
        
        for (const key of possibleKeys) {
          try {
            await s3Client.send(new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: key,
            }));
            
            // Video file exists! Update status to COMPLETE
            console.log(`Found video at: ${key} - marking as COMPLETE`);
            
            await dynamoClient.send(new UpdateCommand({
              TableName: TABLE_NAME,
              Key: {
                PK: formattedTenantId,
                SK: `PROJ#${projectId}`,
              },
              UpdateExpression: 'SET #status = :status, #videoS3Key = :videoS3Key, #videoProgress = :videoProgress, #updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#videoS3Key': 'videoS3Key',
                '#videoProgress': 'videoProgress',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':status': 'COMPLETE',
                ':videoS3Key': key,
                ':videoProgress': {
                  stage: 'COMPLETE',
                  completedAt: new Date().toISOString(),
                },
                ':updatedAt': new Date().toISOString(),
              },
            }));

            // Generate signed URL for the video
            const command = new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: key,
            });
            const signedVideoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

            return NextResponse.json({
              status: 'COMPLETE',
              videoS3Key: key,
              videoUrl: signedVideoUrl,
              videoProgress: { stage: 'COMPLETE', completedAt: new Date().toISOString() },
              taskStatus,
              durationMap: project.durationMap || null,
            });
          } catch {
            // File doesn't exist at this key, continue checking
          }
        }
      }
      
      // If we have an ECS task ARN, check its status
      if (project.videoProgress?.taskArn && ECS_CLUSTER) {
        try {
          const describeResult = await ecsClient.send(new DescribeTasksCommand({
            cluster: ECS_CLUSTER,
            tasks: [project.videoProgress.taskArn],
          }));
          
          const task = describeResult.tasks?.[0];
          if (task) {
            taskStatus = {
              lastStatus: task.lastStatus,
              desiredStatus: task.desiredStatus,
              stoppedReason: task.stoppedReason,
              stoppedAt: task.stoppedAt?.toISOString(),
            };

            // If task stopped but failed (video not found above means it failed)
            if (task.lastStatus === 'STOPPED') {
              const containerExitCode = task.containers?.[0]?.exitCode;
              
              if (containerExitCode !== 0) {
                // Task failed
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
                    ':errorMessage': task.stoppedReason || 'Video recording task failed',
                    ':updatedAt': new Date().toISOString(),
                  },
                }));
                
                return NextResponse.json({
                  status: 'ERROR',
                  errorMessage: task.stoppedReason || 'Video recording task failed',
                  videoProgress: project.videoProgress,
                  taskStatus,
                });
              }
            }
          }
        } catch (ecsError) {
          console.warn('Could not check ECS task status:', ecsError);
        }
      }
    }

    return NextResponse.json({
      status: project.status,
      videoS3Key: actualVideoS3Key || project.videoS3Key || null,
      videoUrl,
      videoProgress: project.videoProgress || null,
      taskStatus,
      durationMap: project.durationMap || null,
    });

  } catch (error) {
    console.error('Error fetching video status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video status' },
      { status: 500 }
    );
  }
}

// Mock video generation for development
async function simulateVideoGeneration(
  tenantId: string,
  projectId: string,
  videoS3Key: string
): Promise<void> {
  // Simulate async video generation
  setTimeout(async () => {
    try {
      // Update status to COMPLETE after a delay
      await dynamoClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: tenantId,
          SK: `PROJ#${projectId}`,
        },
        UpdateExpression: 'SET #status = :status, #videoS3Key = :videoS3Key, #videoProgress = :videoProgress, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#videoS3Key': 'videoS3Key',
          '#videoProgress': 'videoProgress',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'COMPLETE',
          ':videoS3Key': videoS3Key,
          ':videoProgress': {
            stage: 'COMPLETE',
            completedAt: new Date().toISOString(),
            mock: true,
          },
          ':updatedAt': new Date().toISOString(),
        },
      }));
      console.log(`Mock video generation complete for project ${projectId}`);
    } catch (error) {
      console.error('Error in mock video generation:', error);
    }
  }, 10000); // 10 second delay for mock
}
