// 10-12-25: Added email extraction for authenticated user display
// 15-01-25: Created auth context for managing authentication state
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCurrentUser, signIn, signUp, signOut, confirmSignUp, fetchAuthSession } from 'aws-amplify/auth';

interface AuthContextType {
  user: any | null;
  tenantId: string | null;
  email: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string, tenantId: string) => Promise<void>;
  confirmRegistration: (username: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      
      // Extract tenant_id from user attributes
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      const tenantIdFromToken = idToken?.payload?.['custom:tenant_id'] as string | undefined;
      const emailFromToken = typeof idToken?.payload?.email === 'string' ? idToken.payload.email : undefined;
      const loginId = currentUser?.signInDetails?.loginId as string | undefined;
      
      if (tenantIdFromToken) {
        setTenantId(tenantIdFromToken);
      }
      setEmail(emailFromToken ?? loginId ?? null);
    } catch (error: any) {
      // User not authenticated or Amplify not configured
      if (error.name === 'NotAuthorizedException' || error.message?.includes('not configured')) {
        setUser(null);
        setTenantId(null);
        setEmail(null);
      } else {
        console.error('Auth refresh error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      // Sign out any existing user first to avoid UserAlreadyAuthenticatedException
      try {
        await signOut();
      } catch {
        // Ignore sign out errors - user might not be signed in
      }
      
      const { isSignedIn } = await signIn({ username, password });
      if (isSignedIn) {
        await refreshAuth();
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (username: string, password: string, email: string, tenantId: string) => {
    try {
      await signUp({
        username,
        password,
        options: {
          userAttributes: {
            email,
            'custom:tenant_id': tenantId,
          },
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const confirmRegistration = async (username: string, code: string) => {
    try {
      await confirmSignUp({ username, confirmationCode: code });
    } catch (error) {
      console.error('Confirmation error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setUser(null);
      setTenantId(null);
      setEmail(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenantId,
        email,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        confirmRegistration,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
