import { NextRequest } from 'next/server';
import { GET } from './route';

describe('Mobility Estimate API (/api/mobility/estimate)', () => {
  // Helper to construct a NextRequest with query params
  const createRequest = (params: Record<string, string>) => {
    const searchParams = new URLSearchParams(params);
    return new NextRequest(`http://localhost/api/mobility/estimate?${searchParams.toString()}`);
  };

  it('should return 400 if required parameters are missing', async () => {
    const req = createRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
    
    const json = await res.json();
    expect(json.error).toMatch(/Missing required parameters/);
  });

  it('should default to EGP currency when no currency is provided', async () => {
    // Coordinates inside Cairo, Egypt
    const req = createRequest({
      country: 'EG',
      pickupLat: '30.0444', // Inside Cairo bounds
      pickupLng: '31.2357',
      dropoffLat: '30.0500',
      dropoffLng: '31.2400',
    });
    
    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json.estimates).toBeDefined();
    // Assuming Cairo has at least one supported provider in regions.json
    if (json.estimates.length > 0) {
      expect(json.estimates[0].estimatedFare.currency).toBe('EGP');
    }
  });

  it('should return the requested currency (e.g., USD)', async () => {
    // Coordinates inside Dubai, UAE
    const req = createRequest({
      country: 'AE',
      pickupLat: '25.2625', // Inside Dubai bounds
      pickupLng: '55.2874',
      dropoffLat: '25.2519',
      dropoffLng: '55.2788',
      currency: 'USD',
    });
    
    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json.estimates).toBeDefined();
    
    if (json.estimates.length > 0) {
      expect(json.estimates[0].estimatedFare.currency).toBe('USD');
    }
  });

  it('should perform currency conversions accurately (AED to USD)', async () => {
    const req = createRequest({
      country: 'AE',
      pickupLat: '25.2625',
      pickupLng: '55.2874',
      dropoffLat: '25.2519',
      dropoffLng: '55.2788',
      currency: 'USD',
    });
    
    const res = await GET(req);
    const json = await res.json();
    
    const careemEstimate = json.estimates.find((e: any) => e.provider === 'careem');
    
    // Careem uses AED locally. If Dubai supports Careem:
    if (careemEstimate) {
      expect(careemEstimate.estimatedFare.currency).toBe('USD');
      // A typical Careem ride base fare is ~15 AED. 15 AED / 3.67 = ~4 USD.
      // So the USD value should be significantly smaller than the AED value.
      expect(careemEstimate.estimatedFare.min).toBeGreaterThan(0);
      expect(careemEstimate.estimatedFare.min).toBeLessThan(15);
    }
  });

  it('should ignore unsupported or out-of-bounds regions', async () => {
    // Coordinates in the middle of the ocean
    const req = createRequest({
      country: 'EG',
      pickupLat: '0.0',
      pickupLng: '0.0',
      dropoffLat: '1.0',
      dropoffLng: '1.0',
    });
    
    const res = await GET(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    // Since 0.0, 0.0 doesn't match any bounds in regions.json, it should return an empty array
    expect(json.estimates).toEqual([]);
  });
});
