import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google Firebase App Check public keys JWKS endpoint (fully compatible with Edge / Web Handlers)
const APP_CHECK_JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Allow static assets, images, and next internals to bypass early
  const isAsset = 
    path.startsWith('/_next') || 
    path.includes('.') || 
    path.startsWith('/static');
  if (isAsset) {
    return NextResponse.next();
  }

    const hasSession = request.cookies.has('app_session');

  // 2. Global Firebase App Check validation for API requests
  if (process.env.ENFORCE_APP_CHECK === 'true' && path.startsWith('/api/') && !hasSession) {
    const appCheckToken = request.headers.get('X-Firebase-AppCheck');
    if (!appCheckToken) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing X-Firebase-AppCheck attestation header' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    try {
      // Verify JWT token signature at the edge using Google's public JWKS keys
      await jwtVerify(appCheckToken, APP_CHECK_JWKS);
      return NextResponse.next();

    } catch (err) {
      console.error('App Check token verification failed at edge:', err);
      return new NextResponse(
        JSON.stringify({ error: 'Invalid X-Firebase-AppCheck attestation token' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }
  }

  // 3. Session Authentication & Path Access Control
  // If authenticated user tries to access /login, redirect to home
  if (hasSession && path === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (!hasSession && path === '/login') {
    return NextResponse.next();
  }

  if (process.env.ENFORCE_APP_CHECK === 'false' && path.startsWith('/api/')){
    return NextResponse.next();
  }

  if (!hasSession) {
    return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
  }
  const isProtectedPath = 
    path.startsWith('') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/walk-route') ||
    path.startsWith('/api/traffic-route') ||
    path.startsWith('/api/search') ||
    path.startsWith('/api/stt') ||
    path.startsWith('/api/gtfs') ||
    path.startsWith('/api/tts');

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

// Export aliases to ensure Next.js 16 dev (turbopack/webpack) and production runtimes intercept requests cleanly
export const middleware = proxy;
export default proxy;

