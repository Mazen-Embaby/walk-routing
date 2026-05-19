import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, origin, destination, waypoints = [] } = body;

    if (!origin || !destination) {
      return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
    }

    if (waypoints.length > 23) {
      return NextResponse.json({ error: 'Maximum of 23 intermediate waypoints are allowed' }, { status: 400 });
    }

    if (provider === 'google') {
      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) {
        return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured in .env' }, { status: 400 });
      }

      const googleUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
      
      const payload = {
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        intermediates: waypoints.map((wp: any) => ({
          location: { latLng: { latitude: wp.lat, longitude: wp.lng } }
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE"
      };

      const response = await fetch(googleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json({ error: data.error?.message || 'Failed to compute Google traffic route' }, { status: response.status });
      }

      if (!data.routes || data.routes.length === 0) {
        return NextResponse.json({ error: 'No route found' }, { status: 404 });
      }

      const route = data.routes[0];
      return NextResponse.json({
        distance: route.distanceMeters,
        duration: parseInt(route.duration.replace('s', ''), 10), // duration comes as "1800s"
        polyline: route.polyline.encodedPolyline,
        provider: 'google'
      });

    } else if (provider === 'mapbox' || !provider) {
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) {
        return NextResponse.json({ error: 'MAPBOX_ACCESS_TOKEN is not configured in .env' }, { status: 400 });
      }

      const coordinates = [
        `${origin.lng},${origin.lat}`,
        ...waypoints.map((wp: any) => `${wp.lng},${wp.lat}`),
        `${destination.lng},${destination.lat}`
      ].join(';');

      const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?access_token=${token}&geometries=polyline&overview=full`;
      
      const response = await fetch(mapboxUrl);
      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json({ error: data.message || 'Failed to compute Mapbox traffic route' }, { status: response.status });
      }

      if (!data.routes || data.routes.length === 0) {
        return NextResponse.json({ error: 'No route found' }, { status: 404 });
      }

      const route = data.routes[0];
      return NextResponse.json({
        distance: route.distance, // Mapbox returns meters
        duration: route.duration, // Mapbox returns seconds
        polyline: route.geometry, // Mapbox returns encoded polyline string when geometries=polyline
        provider: 'mapbox'
      });

    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Traffic routing API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
