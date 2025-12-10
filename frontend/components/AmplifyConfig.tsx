// 15-01-25: Created client component for Amplify configuration
// 10-12-25: Removed region from Cognito config (inferred from userPoolId in v6)
'use client';

import { useEffect } from 'react';
import { Amplify } from 'aws-amplify';

export function AmplifyConfig({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId,
            userPoolClientId: clientId,
          },
        },
      }, { ssr: true });
    }
  }, []);

  return <>{children}</>;
}



