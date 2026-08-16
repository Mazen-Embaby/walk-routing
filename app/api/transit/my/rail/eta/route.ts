import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtEtas } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const stopId = searchParams.get('stopId');

  const country = regionsConfig.countries.find((r: any) => r.code === 'MY');
  const region = country?.regions.find((c: any) => c.id === 'MY_Rail') as any;
  const feedUrl = region?.dataSources?.gtfsRtTripUpdates;

  if (!feedUrl || feedUrl === '') {
    return NextResponse.json({ error: `No GTFS-RT Trip Updates feed found for region MY Rail` }, { status: 404 });
  }

  try {
    const data = await fetchGtfsRtEtas(feedUrl, routeId, stopId);
    
    return NextResponse.json(data, {
      status: 200,
      headers: {
        // Cache for 32s as requested for Malaysia API
        'Cache-Control': 'public, s-maxage=32, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    console.error('Error fetching MY Rail ETAs:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
