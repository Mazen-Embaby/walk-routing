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
        // action can be 'add' or 'remove'
        const { action, id, name, latitude, longitude, address } = body;

        if (!action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        const userId = session.user.id;

        if (action === 'add') {
            if (!name || latitude === undefined || longitude === undefined) {
                return NextResponse.json({ error: 'Missing required place fields' }, { status: 400 });
            }
            
            // For places, we don't have a natural unique constraint besides the DB ID, 
            // but the client might not have an ID yet. We can just create it.
            const newPlace = await prisma.favoritePlace.create({
                data: {
                    userId,
                    name,
                    latitude,
                    longitude,
                    address
                }
            });
            return NextResponse.json({ success: true, place: newPlace });
        } else if (action === 'remove') {
            if (!id) {
                return NextResponse.json({ error: 'Missing place id to remove' }, { status: 400 });
            }

            await prisma.favoritePlace.deleteMany({
                where: {
                    id,
                    userId
                }
            });
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('Failed to toggle favorite place', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
