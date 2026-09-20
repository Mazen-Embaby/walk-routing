import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
    const session = await auth.api.getSession({
        headers: req.headers
    });

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { routeType, regionId, routeId, isFavorite, countryISO } = body;

        if (!routeType || !regionId || !routeId || typeof isFavorite !== 'boolean') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const userId = session.user.id;
        // Use provided countryISO or derive from regionId (e.g. 'EG_Cairo' -> 'EG')
        const country = countryISO || regionId.split('_')[0].toUpperCase();

        if (isFavorite) {
            // Upsert the favorite
            await prisma.favoriteRoute.upsert({
                where: {
                    userId_routeType_regionId_routeId: {
                        userId,
                        routeType,
                        regionId,
                        routeId
                    }
                },
                update: { countryISO: country },
                create: {
                    userId,
                    routeType,
                    countryISO: country,
                    regionId,
                    routeId
                }
            });
        } else {
            // Delete the favorite if it exists
            await prisma.favoriteRoute.deleteMany({
                where: {
                    userId,
                    routeType,
                    regionId,
                    routeId
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to toggle favorite route', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
