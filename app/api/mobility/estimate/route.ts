import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get('provider'); // 'uber', 'careem', 'grab'
  const pickupLat = searchParams.get('pickupLat');
  const pickupLng = searchParams.get('pickupLng');
  const dropoffLat = searchParams.get('dropoffLat');
  const dropoffLng = searchParams.get('dropoffLng');

  if (!provider || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
    return NextResponse.json(
      { error: 'Missing required parameters (provider, pickupLat, pickupLng, dropoffLat, dropoffLng)' },
      { status: 400 }
    );
  }

  // Calculate a fake distance based on coordinates (just for mock realism)
  const pLat = parseFloat(pickupLat);
  const pLng = parseFloat(pickupLng);
  const dLat = parseFloat(dropoffLat);
  const dLng = parseFloat(dropoffLng);
  
  // Very rough euclidean distance multiplied by a large factor to simulate KM
  const rawDist = Math.sqrt(Math.pow(dLat - pLat, 2) + Math.pow(dLng - pLng, 2));
  const mockDistanceKm = Math.max(1.5, rawDist * 111); // 1 deg ~ 111km

  // Mock Pricing Logic
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
    default:
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }

  // Artificial delay to simulate network/provider latency
  await new Promise((resolve) => setTimeout(resolve, 800));

  return NextResponse.json({
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
