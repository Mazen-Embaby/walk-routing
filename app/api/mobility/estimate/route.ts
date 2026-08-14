import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getSupportedProviders(countryCode: string, pLat: number, pLng: number): string[] {
  try {
    const configPath = path.join(process.cwd(), 'config', 'regions.json');
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const regionsConfig = JSON.parse(fileContents);

    const countryObj = regionsConfig.regions.find((c: any) => c.code === countryCode);
    if (!countryObj || !countryObj.cities) return [];

    for (const city of countryObj.cities) {
      if (city.bounds) {
        const { latitudeSouth, latitudeNorth, longitudeWest, longitudeEast } = city.bounds;
        if (
          pLat >= latitudeSouth &&
          pLat <= latitudeNorth &&
          pLng >= longitudeWest &&
          pLng <= longitudeEast
        ) {
          return city.supportedRideProviders || [];
        }
      }
    }
    return [];
  } catch (error) {
    console.error('Error reading regions.json:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const country = searchParams.get('country');
  const pickupLat = searchParams.get('pickupLat');
  const pickupLng = searchParams.get('pickupLng');
  const dropoffLat = searchParams.get('dropoffLat');
  const dropoffLng = searchParams.get('dropoffLng');

  if (!country || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
    return NextResponse.json(
      { error: 'Missing required parameters (country, pickupLat, pickupLng, dropoffLat, dropoffLng)' },
      { status: 400 }
    );
  }

  const pLat = parseFloat(pickupLat);
  const pLng = parseFloat(pickupLng);
  const dLat = parseFloat(dropoffLat);
  const dLng = parseFloat(dropoffLng);

  // Very rough euclidean distance multiplied by a large factor to simulate KM
  const rawDist = Math.sqrt(Math.pow(dLat - pLat, 2) + Math.pow(dLng - pLng, 2));
  const mockDistanceKm = Math.max(1.5, rawDist * 111); // 1 deg ~ 111km

  // Determine supported providers using hybrid geospatial check
  const supportedProviders = getSupportedProviders(country, pLat, pLng);

  const estimates = [];

  for (const provider of supportedProviders) {
    let minFare = 0;
    let maxFare = 0;
    let currency = 'USD';
    let etaMinutes = 0;

    switch (provider.toLowerCase()) {
      case 'uber':
        minFare = Math.round(mockDistanceKm * 1.2 + 5.0); // $5 base + $1.2/km
        maxFare = Math.round(minFare * 1.3);
        etaMinutes = Math.floor(Math.random() * 5) + 2; // 2 to 6 minutes
        break;
      case 'careem':
        minFare = Math.round(mockDistanceKm * 3.5 + 15.0); // AED 15 base + 3.5/km
        maxFare = Math.round(minFare * 1.25);
        currency = 'AED';
        etaMinutes = Math.floor(Math.random() * 8) + 3; // 3 to 10 minutes
        break;
      case 'grab':
        minFare = Math.round(mockDistanceKm * 4.0 + 10.0); // MYR 10 base + 4/km
        maxFare = Math.round(minFare * 1.4);
        currency = 'MYR';
        etaMinutes = Math.floor(Math.random() * 10) + 1; // 1 to 10 minutes
        break;
      case 'yango':
        minFare = Math.round(mockDistanceKm * 3.0 + 12.0); // AED 12 base + 3/km
        maxFare = Math.round(minFare * 1.3);
        currency = 'AED';
        etaMinutes = Math.floor(Math.random() * 7) + 2; // 2 to 8 minutes
        break;
      default:
        continue;
    }

    estimates.push({
      provider: provider.toLowerCase(),
      estimatedFare: {
        min: minFare,
        max: maxFare,
        currency: currency,
      },
      etaMinutes: etaMinutes,
      distanceKm: parseFloat(mockDistanceKm.toFixed(1)),
      isMock: true,
    });
  }

  // Artificial delay to simulate network/provider latency
  await new Promise((resolve) => setTimeout(resolve, 800));

  return NextResponse.json({
    estimates: estimates
  });
}
