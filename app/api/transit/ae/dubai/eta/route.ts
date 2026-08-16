import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtEtas } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const stopId = searchParams.get('stopId');

  const country = regionsConfig.countries.find((r: any) => r.code === 'AE');
  const region = country?.regions.find((c: any) => c.id === 'AE_Dubai') as any;
  const feedUrl = region?.dataSources?.gtfsRtTripUpdates;

  if (!feedUrl || feedUrl === '') {
    return NextResponse.json({ error: `No GTFS-RT Trip Updates feed found for region Dubai` }, { status: 404 });
  }

  try {
    const headers: HeadersInit = {};
    if (process.env.SWIFTLY_API_KEY_DUBAI) {
      headers['Authorization'] = process.env.SWIFTLY_API_KEY_DUBAI;
    }

    const data = await fetchGtfsRtEtas(feedUrl, routeId, stopId, headers);
    
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=32, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    console.error('Error fetching Dubai ETAs:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
