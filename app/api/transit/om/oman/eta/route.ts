import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtEtas } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const stopId = searchParams.get('stopId');

  const country = regionsConfig.regions.find(r => r.code === 'OM');
  const city = country?.cities.find(c => c.id === 'Oman') as any;
  const feedUrl = city?.dataSources?.gtfsRtTripUpdates;

  if (!feedUrl) {
    return NextResponse.json({ error: `No GTFS-RT Trip Updates feed found for region Oman` }, { status: 404 });
  }

  try {
    const data = await fetchGtfsRtEtas(feedUrl, routeId, stopId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching Oman ETAs:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
