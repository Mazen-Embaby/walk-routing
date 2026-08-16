import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtEtas } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const stopId = searchParams.get('stopId');

  const country = regionsConfig.countries.find((r: any) => r.code === 'OM');
  const region = country?.regions.find((c: any) => c.id === 'OM_Oman') as any;
  const feedUrl = region?.dataSources?.gtfsRtTripUpdates;

  if (!feedUrl || feedUrl === '') {
    return NextResponse.json({ error: `No GTFS-RT Trip Updates feed found for region Oman` }, { status: 404 });
  }

  try {
    const data = await fetchGtfsRtEtas(feedUrl, routeId, stopId);
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=32, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    console.error('Error fetching Oman ETAs:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
