import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
    const session = await auth.api.getSession({
        headers: req.headers
    });

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const favorites = await prisma.favoriteRoute.findMany({
            where: { userId: session.user.id },
            select: {
                routeType: true,
                regionId: true,
                routeId: true
            }
        });

        // Format into two lists for the app
        const favoriteRoutes = favorites
            .filter(f => f.routeType === 'transit')
            .map(f => `${f.regionId}|${f.routeId}`);
            
        const favoriteRailTrips = favorites
            .filter(f => f.routeType === 'rail')
            .map(f => `${f.regionId}|${f.routeId}`);

        return NextResponse.json({
            favoriteRoutes,
            favoriteRailTrips
        });
    } catch (error) {
        console.error('Failed to fetch favorite routes', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
