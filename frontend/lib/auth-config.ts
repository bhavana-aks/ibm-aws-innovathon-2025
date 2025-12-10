// 15-01-25: Created Amplify configuration for Cognito authentication
// 10-12-25: Removed region from Cognito config (inferred from userPoolId in v6)
'use client';

import { Amplify } from 'aws-amplify';

export function configureAmplify() {
  // Use NEXT_PUBLIC_ prefix for client-side env vars
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    console.warn('Cognito configuration missing. Auth features will not work.');
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
      },
    },
  }, { ssr: true });
}



