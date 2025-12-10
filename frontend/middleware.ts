// 15-01-25: Created middleware for route protection
// Note: Amplify handles auth via cookies, so we'll do basic route protection
// Full auth check happens client-side via AuthContext
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // For API routes, let them handle their own auth
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Check for Cognito auth cookies (Amplify uses these)
  const hasAuthCookie = request.cookies.has('CognitoIdentityServiceProvider') ||
                        request.cookies.toString().includes('CognitoIdentityServiceProvider');

  // If accessing a protected route, we'll let the client-side handle redirect
  // This is because Amplify auth state is managed client-side
  // The AuthContext will handle redirects if user is not authenticated
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};



