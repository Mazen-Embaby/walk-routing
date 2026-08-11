import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtVehicles } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const vehicleId = searchParams.get('vehicleId');

  const country = regionsConfig.regions.find(r => r.code === 'AE');
  const city = country?.cities.find(c => c.id === 'Dubai') as any;
  const feedUrl = city?.dataSources?.gtfsRtVehiclePositions;

  if (!feedUrl || feedUrl === '') {
    return NextResponse.json({ error: `No GTFS-RT Vehicle Positions feed found for region Dubai` }, { status: 404 });
  }

  try {
    const headers: HeadersInit = {};
    if (process.env.SWIFTLY_API_KEY_DUBAI) {
      headers['Authorization'] = process.env.SWIFTLY_API_KEY_DUBAI;
    }

    const data = await fetchGtfsRtVehicles(feedUrl, routeId, vehicleId, headers);
    
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=32, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    console.error('Error fetching Dubai Vehicles:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
