import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export async function fetchGtfsRtEtas(feedUrl: string, routeId: string | null, stopId: string | null) {
  const response = await fetch(feedUrl, {
    next: { revalidate: 30 }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GTFS-RT from ${feedUrl}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const etas = [];

  for (const entity of feed.entity) {
    if (entity.tripUpdate) {
      const trip = entity.tripUpdate.trip;
      
      // If routeId is provided, skip if it doesn't match (unless routeId is missing in the feed)
      if (routeId && trip.routeId && trip.routeId !== routeId) continue;

      for (const stopTimeUpdate of entity.tripUpdate.stopTimeUpdate) {
        // If stopId is provided, skip if it doesn't match
        if (stopId && stopTimeUpdate.stopId !== stopId) continue;

        // Convert protobuf Long to standard number if needed
        const arrivalTime = stopTimeUpdate.arrival?.time;
        const departureTime = stopTimeUpdate.departure?.time;

        etas.push({
          tripId: trip.tripId,
          routeId: trip.routeId,
          directionId: trip.directionId,
          stopId: stopTimeUpdate.stopId,
          arrival: stopTimeUpdate.arrival ? {
            delay: stopTimeUpdate.arrival.delay,
            time: typeof arrivalTime === 'object' && arrivalTime !== null && 'low' in arrivalTime ? arrivalTime.low : arrivalTime,
          } : null,
          departure: stopTimeUpdate.departure ? {
            delay: stopTimeUpdate.departure.delay,
            time: typeof departureTime === 'object' && departureTime !== null && 'low' in departureTime ? departureTime.low : departureTime,
          } : null,
          scheduleRelationship: stopTimeUpdate.scheduleRelationship,
        });
      }
    }
  }

  const headerTimestamp = feed.header.timestamp;
  return {
    timestamp: typeof headerTimestamp === 'object' && headerTimestamp !== null && 'low' in headerTimestamp ? headerTimestamp.low : headerTimestamp,
    etas,
  };
}

export async function fetchGtfsRtVehicles(feedUrl: string, routeId: string | null, vehicleId: string | null) {
  const response = await fetch(feedUrl, {
    next: { revalidate: 15 }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GTFS-RT from ${feedUrl}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const vehicles = [];

  for (const entity of feed.entity) {
    if (entity.vehicle) {
      const vehicle = entity.vehicle;
      
      // Filter by routeId if provided
      if (routeId && vehicle.trip?.routeId && vehicle.trip?.routeId !== routeId) continue;
      
      // Filter by vehicleId if provided
      if (vehicleId && vehicle.vehicle?.id !== vehicleId) continue;

      const timestamp = vehicle.timestamp;

      vehicles.push({
        id: vehicle.vehicle?.id,
        label: vehicle.vehicle?.label,
        licensePlate: vehicle.vehicle?.licensePlate,
        tripId: vehicle.trip?.tripId,
        routeId: vehicle.trip?.routeId,
        directionId: vehicle.trip?.directionId,
        position: vehicle.position ? {
          latitude: vehicle.position.latitude,
          longitude: vehicle.position.longitude,
          bearing: vehicle.position.bearing,
          odometer: vehicle.position.odometer,
          speed: vehicle.position.speed,
        } : null,
        currentStopSequence: vehicle.currentStopSequence,
        stopId: vehicle.stopId,
        currentStatus: vehicle.currentStatus,
        timestamp: typeof timestamp === 'object' && timestamp !== null && 'low' in timestamp ? timestamp.low : timestamp,
      });
    }
  }

  const headerTimestamp = feed.header.timestamp;
  return {
    timestamp: typeof headerTimestamp === 'object' && headerTimestamp !== null && 'low' in headerTimestamp ? headerTimestamp.low : headerTimestamp,
    vehicles,
  };
}
