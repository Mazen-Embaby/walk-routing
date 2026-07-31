import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Darbi does not expose a public vehicle positions feed currently.
  // We return an empty vehicle list to prevent frontend errors.
  return NextResponse.json({
    timestamp: Math.floor(Date.now() / 1000),
    vehicles: []
  });
}
