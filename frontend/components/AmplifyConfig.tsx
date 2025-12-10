// 15-01-25: Created client component for Amplify configuration
'use client';

import { useEffect } from 'react';
import { Amplify } from 'aws-amplify';

export function AmplifyConfig({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';

    if (userPoolId && clientId) {
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
  }, []);

  return <>{children}</>;
}



