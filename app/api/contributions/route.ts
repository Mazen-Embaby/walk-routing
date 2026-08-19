import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '../../../lib/db';
import { auth } from '../../../lib/auth';

// Points awarded per contribution type
const POINTS_MAP: Record<string, number> = {
  new_route: 10,
  stop: 5,
  shape: 50,
  schedule: 5,
  deprecated_route: 5,
};

/**
 * GET /api/contributions?status=pending
 * Fetch contributions for a specific device (identified by fcmToken header).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fcmToken = request.headers.get('x-fcm-token');
  const status = searchParams.get('status');
  
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    });
  } catch (e) {
    console.error('getSession GET error:', e);
  }
  
  let userId = session?.user?.id || null;

  if (!fcmToken && !userId) {
    return NextResponse.json(
      { error: 'x-fcm-token header or valid auth session is required' },
      { status: 400 }
    );
  }

  try {
    const where: Record<string, unknown> = {};
    if (userId) {
      where.userId = userId;
    } else if (fcmToken) {
      where.fcmToken = fcmToken;
    }
    
    if (status) {
      where.status = status;
    }

    const contributions = await prisma.contribution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      contributions,
      totalPoints: contributions.reduce((sum, c) => sum + c.points, 0),
    });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contributions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contributions
 * Submit a new contribution/report.
 *
 * Headers: { 'x-fcm-token': string, 'Authorization': 'Bearer <token>' }
 * Body: {
 *   category: 'missing_data' | 'wrong_data',
 *   subcategory: 'new_route' | 'stop' | 'shape' | 'schedule' | 'deprecated_route',
 *   regionId: string,
 *   routeId?: string,
 *   routeName?: string,
 *   description: string,
 *   latitude?: number,
 *   longitude?: number,
 *   shapeData?: Array<{lat: number, lng: number, ts: number}>,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fcmToken = request.headers.get('x-fcm-token');
    let session = null;
    try {
      session = await auth.api.getSession({
        headers: await headers(),
      });
    } catch (e) {
      console.error('getSession error:', e);
    }
    
    let userId = session?.user?.id || null;

    const {
      category,
      subcategory,
      regionId,
      routeId,
      routeName,
      description,
      latitude,
      longitude,
      shapeData,
    } = body;

    // Validate required fields
    if ((!fcmToken && !userId) || !category || !subcategory || !regionId || description === undefined) {
      console.log('Validation failed:', { fcmToken, userId, category, subcategory, regionId, description });
      console.log('Headers received:', Object.fromEntries(request.headers.entries()));
      return NextResponse.json(
        {
          error: 'Missing required fields: x-fcm-token header (or auth), category, subcategory, regionId, description',
          details: { fcmToken, userId, category, subcategory, regionId, description }
        },
        { status: 400 }
      );
    }

    // Validate category
    if (!['missing_data', 'wrong_data'].includes(category)) {
      return NextResponse.json(
        { error: 'category must be "missing_data" or "wrong_data"' },
        { status: 400 }
      );
    }

    // Validate subcategory
    const validSubcategories = ['new_route', 'stop', 'shape', 'schedule', 'deprecated_route', 'fare'];
    if (!validSubcategories.includes(subcategory)) {
      return NextResponse.json(
        { error: `subcategory must be one of: ${validSubcategories.join(', ')}` },
        { status: 400 }
      );
    }

    const points = POINTS_MAP[subcategory] || 5;

    const contribution = await prisma.contribution.create({
      data: {
        fcmToken: fcmToken || 'anonymous-session',
        userId,
        category,
        subcategory,
        regionId,
        routeId: routeId || null,
        routeName: routeName || null,
        description,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        shapeData: shapeData || null,
        points,
      },
    });

    return NextResponse.json(
      {
        contribution,
        message: `Thank you for your contribution! You earned ${points} points.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating contribution:', error);
    return NextResponse.json(
      { error: 'Failed to create contribution' },
      { status: 500 }
    );
  }
}
