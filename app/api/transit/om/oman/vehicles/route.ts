import { NextResponse } from 'next/server';
import regionsConfig from '../../../../../../config/regions.json';
import { fetchGtfsRtVehicles } from '../../../utils/gtfsRtFetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const vehicleId = searchParams.get('vehicleId');

  const country = regionsConfig.regions.find(r => r.code === 'OM');
  const city = country?.cities.find(c => c.id === 'Oman') as any;
  const feedUrl = city?.dataSources?.gtfsRtVehiclePositions;

  if (!feedUrl) {
    return NextResponse.json({ error: `No GTFS-RT Vehicle Positions feed found for region Oman` }, { status: 404 });
  }

  try {
    const data = await fetchGtfsRtVehicles(feedUrl, routeId, vehicleId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching Oman Vehicles:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
