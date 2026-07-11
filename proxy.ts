import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

// Ensure Firebase Admin is initialized strictly once across invocations
function ensureFirebaseAdminInitialized() {
  if (!getApps().length) {
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        // Option A: Parse inline JSON string from .env (ideal for serverless/Vercel)
        initializeApp({
          credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        });
      } else {
        // Option B: Uses GOOGLE_APPLICATION_CREDENTIALS file path from .env automatically
        initializeApp();
      }
    } catch (err) {
      console.error('Firebase Admin initialization warning:', err);
    }
  }
}

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
      ensureFirebaseAdminInitialized();
      await getAppCheck().verifyToken(appCheckToken);
      return NextResponse.next();

    } catch (err) {
      console.error('App Check token verification failed:', err);
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

  const isPublicPath = 
    path === '/login' || 
    path.startsWith('/api/auth') ||
    path.startsWith('/api/walk-route') ||
    path.startsWith('/api/traffic-route') ||
    path.startsWith('/api/search') ||
    path.startsWith('/api/stt') ||
    path.startsWith('/api/gtfs') ||
    path.startsWith('/api/tts');

  // If unauthenticated user tries to access a protected path
  if (!isPublicPath && !hasSession) {
    if (path.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
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

// Export aliases to ensure Next.js 16 dev (turbopack/webpack) and production runtimes intercept requests cleanly
export const middleware = proxy;
export default proxy;

