import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const envUsername = process.env.APP_USERNAME || 'admin';
    const envPassword = process.env.APP_PASSWORD || 'password123';

    if (username === envUsername && password === envPassword) {
      const cookieStore = await cookies();
      cookieStore.set('app_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
        sameSite: 'lax',
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
