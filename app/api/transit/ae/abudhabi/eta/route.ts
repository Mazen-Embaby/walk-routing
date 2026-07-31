import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('routeId');
  const stopId = searchParams.get('stopId');

  if (!stopId) {
    // Darbi API requires a stopId (BusStopDepartureBoard).
    // If the frontend queries for an entire route without a stop (e.g., from routeEtasProvider),
    // we cannot fetch all ETAs efficiently. We act as an adapter and gracefully return empty.
    return NextResponse.json({
      timestamp: Math.floor(Date.now() / 1000),
      etas: []
    });
  }

  // Extract base stop ID and optional platform (e.g. 1011900-0-A -> 1011900, A)
  let darbiQueryText = stopId;
  let targetPlatform: string | null = null;
  const platformMatch = stopId.match(/^([0-9]+)-0-([a-zA-Z])$/);
  if (platformMatch) {
    darbiQueryText = platformMatch[1];
    targetPlatform = platformMatch[2].toUpperCase();
  }

  const url = `https://darbi.itc.gov.ae/dotservices/proxyAPI/proxy.ashx?https://darbi.itc.gov.ae/dotservices/api/MMJPv5/BusStopDepartureBoard?&text=${darbiQueryText}&direct=true&info=&limit=32&language=en`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': '*/*',
        'Referer': 'https://darbi.itc.gov.ae/darbweb/map-viewer.html',
        'User-Agent': 'Mozilla/5.0'
      },
      next: { revalidate: 30 }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Darbi: ${response.status}`);
    }

    const data = await response.json();
    const etas = [];

    // Darbi BusStopDepartureBoard returns { Departures: [...], Lines: [...] }
    const items = Array.isArray(data) ? data : (data.Departures || data.d || []);
    for (const item of items) {
      // Filter by route if requested
      if (routeId && item.Line?.Id !== routeId && item.Line?.Number !== routeId) {
        continue;
      }

      // Filter by platform if requested (crucial to separate directions)
      if (targetPlatform && item.Stop?.platform && item.Stop.platform.toUpperCase() !== targetPlatform) {
        continue;
      }

      // Convert time "2026-07-27T05:31:00+04:00" to unix timestamp
      const timeMs = new Date(item.Time).getTime();
      const timeSec = Math.floor(timeMs / 1000);

      etas.push({
        tripId: null, // Not provided by Darbi
        routeId: item.Line?.Id || item.Line?.Number,
        directionId: null,
        stopId: stopId,
        arrival: {
          delay: item.delayTime || 0,
          time: timeSec,
        },
        departure: {
          delay: item.delayTime || 0,
          time: timeSec,
        },
        scheduleRelationship: item.IsRealtime ? 'SCHEDULED' : 'SCHEDULED',
        _darbiExtra: {
          isRealtime: item.IsRealtime,
          remainingMinutes: item.Remaining,
          destination: item.Line?.Destination
        }
      });
    }

    return NextResponse.json({
      timestamp: Math.floor(Date.now() / 1000),
      etas,
    });
  } catch (error) {
    console.error('Error fetching Abu Dhabi ETAs:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
