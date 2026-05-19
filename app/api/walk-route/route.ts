import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const engine = searchParams.get('engine') || 'osrm';
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      return NextResponse.json({ error: 'Start and end coordinates are required (lat,lng)' }, { status: 400 });
    }

    const [startLat, startLng] = start.split(',').map(Number);
    const [endLat, endLng] = end.split(',').map(Number);

    if (engine === 'osrm') {
      // Free public OSRM footprint routing endpoint
      const osrmUrl = `http://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      
      const response = await fetch(osrmUrl);
      const data = await response.json();
      
      if (data.code !== 'Ok') {
        throw new Error('OSRM routing failed: ' + data.message);
      }

      const route = data.routes[0];
      return NextResponse.json({
        engine: 'OSRM',
        distance: route.distance, // in meters
        duration: route.duration, // in seconds
        geometry: route.geometry, // GeoJSON LineString
      });
    } 
    else if (engine === 'mapbox') {
      const mapboxKey = process.env.MAPBOX_ACCESS_TOKEN;
      if (!mapboxKey) return NextResponse.json({ error: 'Mapbox API key is required in environment variables (.env)'}, { status: 400 });

      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${mapboxKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') throw new Error('Mapbox routing failed: ' + data.message);

      const route = data.routes[0];
      return NextResponse.json({
        engine: 'Mapbox',
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry,
      });
    }
    else if (engine === 'graphhopper') {
      const ghKey = process.env.GRAPHHOPPER_API_KEY;
      if (!ghKey) return NextResponse.json({ error: 'GraphHopper API key is required in environment variables (.env)'}, { status: 400 });

      const url = `https://graphhopper.com/api/1/route?point=${startLat},${startLng}&point=${endLat},${endLng}&vehicle=foot&points_encoded=false&key=${ghKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.paths || data.paths.length === 0) throw new Error('GraphHopper routing failed.');

      const path = data.paths[0];
      return NextResponse.json({
        engine: 'GraphHopper',
        distance: path.distance,
        duration: path.time / 1000,
        geometry: path.points,
      });
    }
    else if (engine === 'google') {
      const googleKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleKey) return NextResponse.json({ error: 'Google Maps API key is required in environment variables (.env)'}, { status: 400 });

      const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;
      const body = {
        origin: { location: { latLng: { latitude: startLat, longitude: startLng } } },
        destination: { location: { latLng: { latitude: endLat, longitude: endLng } } },
        travelMode: 'WALK',
        polylineEncoding: 'ENCODED_POLYLINE'
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Google Maps routing failed: ' + (data.error?.message || response.statusText));
      }

      const route = data.routes?.[0];
      if (!route) {
        throw new Error('Google Maps routing failed: No route found');
      }
      
      // Decode overview_polyline
      const points = route.polyline.encodedPolyline;
      let index = 0, lat = 0, lng = 0, coordinates = [];
      while (index < points.length) {
        let b, shift = 0, result = 0;
        do {
          b = points.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        
        shift = 0;
        result = 0;
        do {
          b = points.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        
        coordinates.push([lng / 1e5, lat / 1e5]);
      }

      return NextResponse.json({
        engine: 'Google',
        distance: route.distanceMeters,
        duration: parseInt(route.duration.replace('s', ''), 10),
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
      });
    }
    else {
      return NextResponse.json({ error: `Routing engine '${engine}' is not fully implemented or unsupported without keys.` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Routing Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch route' }, { status: 500 });
  }
}
