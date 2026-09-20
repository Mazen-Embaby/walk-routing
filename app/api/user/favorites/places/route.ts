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
        const favoritePlaces = await prisma.favoritePlace.findMany({
            where: { userId: session.user.id },
            select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
                address: true
            }
        });

        return NextResponse.json({
            favoritePlaces
        });
    } catch (error) {
        console.error('Failed to fetch favorite places', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
