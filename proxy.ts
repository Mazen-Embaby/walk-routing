import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = request.cookies.has('app_session');

  // Define public paths that don't require authentication
  const isPublicPath = 
    path === '/login' || 
    path.startsWith('/api/auth') ||
    path.startsWith('/api/walk-route') ||
    path.startsWith('/api/traffic-route') ||
    path.startsWith('/api/search') ||
    path.startsWith('/api/stt') ||
    path.startsWith('/api/gtfs') ||
    path.startsWith('/api/tts');

  // If it's a public path and the user is authenticated, redirect them to the home page
  if (isPublicPath && hasSession && path === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // If it's a protected path and the user is NOT authenticated, redirect them to /login or return 401 for APIs
  if (!isPublicPath && !hasSession) {
    // Check if the request is for an API route
    if (path.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    // Allow static assets, images, and next internals to bypass middleware
    const isAsset = 
      path.startsWith('/_next') || 
      path.includes('.') || 
      path.startsWith('/static');

    if (!isAsset) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

// Configure matcher to run middleware on relevant paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
