// 10-12-25: Added standalone output for AWS Amplify deployment
// 10-12-25: Added serverRuntimeConfig for SSR environment variables
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Expose environment variables to server-side code
  serverRuntimeConfig: {
    // These will only be available on the server side
    APP_AWS_REGION: process.env.APP_AWS_REGION,
    APP_AWS_ACCESS_KEY_ID: process.env.APP_AWS_ACCESS_KEY_ID,
    APP_AWS_SECRET_ACCESS_KEY: process.env.APP_AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME,
    ECS_CLUSTER_NAME: process.env.ECS_CLUSTER_NAME,
    ECS_TASK_FAMILY: process.env.ECS_TASK_FAMILY,
    ECS_SUBNETS: process.env.ECS_SUBNETS,
    ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS,
  },
  // Expose environment variables to both client and server
  env: {
    APP_AWS_REGION: process.env.APP_AWS_REGION || 'us-east-1',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || '',
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || 'VideoSaaS',
    ECS_CLUSTER_NAME: process.env.ECS_CLUSTER_NAME || '',
    ECS_TASK_FAMILY: process.env.ECS_TASK_FAMILY || '',
    ECS_SUBNETS: process.env.ECS_SUBNETS || '',
    ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS || '',
  },
};

export default nextConfig;
