// 15-01-25: Created Amplify configuration for Cognito authentication
'use client';

import { Amplify } from 'aws-amplify';

export function configureAmplify() {
  // Use NEXT_PUBLIC_ prefix for client-side env vars
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const region = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';

  if (!userPoolId || !clientId) {
    console.warn('Cognito configuration missing. Auth features will not work.');
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        region,
      },
    },
  }, { ssr: true });
}



