// 10-12-25: Simplified config for Next.js 16 - env vars handled by Amplify serverSideEnvironmentVariables
// 10-12-25: Added standalone output for AWS Amplify deployment
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Environment variables are automatically available via process.env in API routes
  // For Amplify, serverSideEnvironmentVariables in amplify.yml passes them to runtime
};

export default nextConfig;
