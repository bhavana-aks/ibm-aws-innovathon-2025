// 07-12-25: Created S3 utilities for video recording container
// Phase 5: S3 Download/Upload Utilities

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';
import { Readable } from 'stream';

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

/**
 * Download a file from S3 to local path
 */
export async function downloadFromS3(
  bucket: string, 
  key: string, 
  localPath: string
): Promise<void> {
  console.log(`Downloading s3://${bucket}/${key} to ${localPath}`);
  
  // Ensure directory exists
  await mkdir(path.dirname(localPath), { recursive: true });

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error(`No body in S3 response for ${key}`);
  }

  const writeStream = createWriteStream(localPath);
  await pipeline(response.Body as Readable, writeStream);
  
  console.log(`Downloaded: ${localPath}`);
}

/**
 * Download all audio files for a project
 */
export async function downloadAudioFiles(
  bucket: string,
  audioPrefix: string,
  localAudioDir: string
): Promise<string[]> {
  console.log(`Downloading audio files from s3://${bucket}/${audioPrefix}`);
  
  await mkdir(localAudioDir, { recursive: true });

  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: audioPrefix,
  });

  const listResponse = await s3Client.send(listCommand);
  const audioFiles: string[] = [];

  if (!listResponse.Contents) {
    console.log('No audio files found');
    return audioFiles;
  }

  for (const object of listResponse.Contents) {
    if (!object.Key || !object.Key.endsWith('.mp3')) continue;

    const fileName = path.basename(object.Key);
    const localPath = path.join(localAudioDir, fileName);
    
    await downloadFromS3(bucket, object.Key, localPath);
    audioFiles.push(localPath);
  }

  console.log(`Downloaded ${audioFiles.length} audio files`);
  return audioFiles;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  localPath: string,
  bucket: string,
  key: string,
  contentType: string = 'video/mp4'
): Promise<void> {
  console.log(`Uploading ${localPath} to s3://${bucket}/${key}`);

  const fileStream = createReadStream(localPath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });

  await s3Client.send(command);
  console.log(`Uploaded: s3://${bucket}/${key}`);
}

/**
 * Get text content from S3
 */
export async function getTextFromS3(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error(`No body in S3 response for ${key}`);
  }

  return await response.Body.transformToString();
}
