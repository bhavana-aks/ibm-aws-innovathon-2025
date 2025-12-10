"use strict";
// 07-12-25: Created S3 utilities for video recording container
// Phase 5: S3 Download/Upload Utilities
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFromS3 = downloadFromS3;
exports.downloadAudioFiles = downloadAudioFiles;
exports.uploadToS3 = uploadToS3;
exports.getTextFromS3 = getTextFromS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const promises_2 = require("stream/promises");
const path_1 = __importDefault(require("path"));
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1'
});
/**
 * Download a file from S3 to local path
 */
async function downloadFromS3(bucket, key, localPath) {
    console.log(`Downloading s3://${bucket}/${key} to ${localPath}`);
    // Ensure directory exists
    await (0, promises_1.mkdir)(path_1.default.dirname(localPath), { recursive: true });
    const command = new client_s3_1.GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
        throw new Error(`No body in S3 response for ${key}`);
    }
    const writeStream = (0, fs_1.createWriteStream)(localPath);
    await (0, promises_2.pipeline)(response.Body, writeStream);
    console.log(`Downloaded: ${localPath}`);
}
/**
 * Download all audio files for a project
 */
async function downloadAudioFiles(bucket, audioPrefix, localAudioDir) {
    console.log(`Downloading audio files from s3://${bucket}/${audioPrefix}`);
    await (0, promises_1.mkdir)(localAudioDir, { recursive: true });
    const listCommand = new client_s3_1.ListObjectsV2Command({
        Bucket: bucket,
        Prefix: audioPrefix,
    });
    const listResponse = await s3Client.send(listCommand);
    const audioFiles = [];
    if (!listResponse.Contents) {
        console.log('No audio files found');
        return audioFiles;
    }
    for (const object of listResponse.Contents) {
        if (!object.Key || !object.Key.endsWith('.mp3'))
            continue;
        const fileName = path_1.default.basename(object.Key);
        const localPath = path_1.default.join(localAudioDir, fileName);
        await downloadFromS3(bucket, object.Key, localPath);
        audioFiles.push(localPath);
    }
    console.log(`Downloaded ${audioFiles.length} audio files`);
    return audioFiles;
}
/**
 * Upload a file to S3
 */
async function uploadToS3(localPath, bucket, key, contentType = 'video/mp4') {
    console.log(`Uploading ${localPath} to s3://${bucket}/${key}`);
    const fileStream = (0, fs_1.createReadStream)(localPath);
    const command = new client_s3_1.PutObjectCommand({
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
async function getTextFromS3(bucket, key) {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
        throw new Error(`No body in S3 response for ${key}`);
    }
    return await response.Body.transformToString();
}
//# sourceMappingURL=s3-utils.js.map