import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const provider = searchParams.get('provider') || 'mapbox';

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Search query parameter "q" is required' }, { status: 400 });
    }

    if (provider === 'google') {
      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) {
        return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured in .env' }, { status: 400 });
      }

      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:EG&key=${key}`;
      const response = await fetch(googleUrl);
      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to contact Google Geocoding API' }, { status: response.status });
      }

      if (data.status === 'ZERO_RESULTS') {
        return NextResponse.json({ results: [] });
      }

      if (data.status !== 'OK') {
        return NextResponse.json({ error: data.error_message || `Google API error: ${data.status}` }, { status: 400 });
      }

      const results = (data.results || []).map((item: any) => ({
        name: item.formatted_address,
        lat: item.geometry.location.lat,
        lng: item.geometry.location.lng,
        provider: 'google'
      }));

      return NextResponse.json({ results });

    } else if (provider === 'mapbox') {
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) {
        return NextResponse.json({ error: 'MAPBOX_ACCESS_TOKEN is not configured in .env' }, { status: 400 });
      }

      const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=EG&limit=5`;
      const response = await fetch(mapboxUrl);
      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json({ error: data.message || 'Failed to contact Mapbox Places API' }, { status: response.status });
      }

      const results = (data.features || []).map((feat: any) => ({
        name: feat.place_name,
        lat: feat.center[1],
        lng: feat.center[0],
        provider: 'mapbox'
      }));

      return NextResponse.json({ results });

    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
