"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  ChevronLeft, 
  Map as MapIcon, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Layers,
  RefreshCw,
  Navigation,
  Clock,
  Activity,
  Trash2
} from 'lucide-react';

// --- Polyline Decoder ---
function decodePolyline(str: string, precision: number = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [];
  let shift = 0, result = 0, byte = null;
  let latitude_change, longitude_change, factor = Math.pow(10, precision);

  while (index < str.length) {
    byte = null; shift = 0; result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    shift = result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change; lng += longitude_change;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

// --- Icons ---
const originIcon = L.divIcon({
  html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #10b981; border: 3px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);"></div>`,
  className: '', iconSize: [20, 20], iconAnchor: [10, 10],
});
const destinationIcon = L.divIcon({
  html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #ef4444; border: 3px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);"></div>`,
  className: '', iconSize: [20, 20], iconAnchor: [10, 10],
});
const waypointIcon = L.divIcon({
  html: `<div style="width: 16px; height: 16px; border-radius: 50%; background-color: #3b82f6; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
});

interface Coordinate { lat: number; lng: number }

function MapClickResponder({ mode, onCoordinateSelect }: { mode: 'origin' | 'destination' | 'waypoint', onCoordinateSelect: (coord: Coordinate) => void }) {
  useMapEvents({
    click(e) {
      onCoordinateSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
}

function ChangeMapBounds({ coords }: { coords: Coordinate[] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [coords, map]);
  return null;
}

export default function TrafficClient() {
  const [provider, setProvider] = useState<'mapbox' | 'google'>('mapbox');
  const [activeMode, setActiveMode] = useState<'origin' | 'waypoint' | 'destination'>('origin');
  
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [waypoints, setWaypoints] = useState<Coordinate[]>([]);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [routeResult, setRouteResult] = useState<{
    distance: number;
    duration: number;
    polyline: [number, number][];
    provider: string;
  } | null>(null);

  const handleCoordinateSelect = (coord: Coordinate) => {
    setError(null);
    if (activeMode === 'origin') {
      setOrigin(coord);
      if (!destination) setActiveMode('destination');
      else setActiveMode('waypoint');
    } else if (activeMode === 'destination') {
      setDestination(coord);
      setActiveMode('waypoint');
    } else if (activeMode === 'waypoint') {
      if (waypoints.length >= 23) {
        setError("Maximum of 23 waypoints reached. This adheres to Mapbox and Google limits.");
        return;
      }
      setWaypoints([...waypoints, coord]);
    }
  };

  const clearAll = () => {
    setOrigin(null);
    setDestination(null);
    setWaypoints([]);
    setRouteResult(null);
    setError(null);
    setActiveMode('origin');
  };

  const calculateRoute = async () => {
    if (!origin || !destination) {
      setError("Origin and Destination are required to calculate a route.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setRouteResult(null);

    try {
      const response = await fetch('/api/traffic-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          origin,
          destination,
          waypoints
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to compute traffic route');
      }

      const decodedPolyline = decodePolyline(data.polyline);

      setRouteResult({
        distance: data.distance,
        duration: data.duration,
        polyline: decodedPolyline,
        provider: data.provider
      });
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during route calculation.');
    } finally {
      setLoading(false);
    }
  };

  const allCoords = [];
  if (origin) allCoords.push(origin);
  if (destination) allCoords.push(destination);
  allCoords.push(...waypoints);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Mesh Gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-rose-900/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-all cursor-pointer"
            >
              <ChevronLeft size={14} /> Back to Planner
            </Link>
            <div className="h-4 w-[1px] bg-slate-800"></div>
            <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-300 tracking-tight flex items-center gap-2">
              <Activity size={18} className="text-emerald-400" /> Multi-Waypoint Traffic Router
            </h1>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
            Protected Route
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Column - Controls (4 Columns) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-xl">
            <h2 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
              <Layers size={16} className="text-emerald-400" /> Routing Provider
            </h2>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800/60">
              <button
                onClick={() => setProvider('mapbox')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  provider === 'mapbox' 
                    ? 'bg-emerald-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mapbox Traffic
              </button>
              <button
                onClick={() => setProvider('google')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  provider === 'google' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google Routes
              </button>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-100">Map Click Action</h2>
              <button onClick={clearAll} className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer">
                <Trash2 size={12} /> Clear All
              </button>
            </div>
            
            <div className="flex flex-col gap-2 mb-6">
              <button
                onClick={() => setActiveMode('origin')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  activeMode === 'origin' ? 'bg-slate-800 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${origin ? 'bg-emerald-500' : 'border-2 border-slate-500'}`}></div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-200">Set Origin</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{origin ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : 'Click map to set'}</div>
                </div>
              </button>

              <button
                onClick={() => setActiveMode('destination')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  activeMode === 'destination' ? 'bg-slate-800 border-rose-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${destination ? 'bg-rose-500' : 'border-2 border-slate-500'}`}></div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-200">Set Destination</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{destination ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}` : 'Click map to set'}</div>
                </div>
              </button>

              <button
                onClick={() => setActiveMode('waypoint')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  activeMode === 'waypoint' ? 'bg-slate-800 border-blue-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${waypoints.length > 0 ? 'bg-blue-500' : 'border-2 border-slate-500'}`}></div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-200">Add Intermediate Waypoints</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{waypoints.length} / 23 waypoints added</div>
                </div>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button 
              onClick={calculateRoute}
              disabled={loading || !origin || !destination}
              className="mt-auto w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <>
                  <Navigation size={16} /> Calculate Traffic Route
                </>
              )}
            </button>
          </div>

        </section>

        {/* Right Column - Map (8 Columns) */}
        <section className="lg:col-span-8 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl relative h-[calc(100vh-180px)] min-h-[500px] flex flex-col">
          
          <div className="flex-1 w-full bg-slate-950 relative z-10">
            <MapContainer 
              center={[30.0444, 31.2357]} // Cairo default
              zoom={13} 
              style={{ height: '100%', width: '100%', background: '#0b0f19' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapClickResponder mode={activeMode} onCoordinateSelect={handleCoordinateSelect} />
              
              {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon} />}
              {destination && <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />}
              {waypoints.map((wp, idx) => (
                <Marker key={idx} position={[wp.lat, wp.lng]} icon={waypointIcon} />
              ))}

              {routeResult && (
                <Polyline 
                  positions={routeResult.polyline} 
                  pathOptions={{ color: routeResult.provider === 'google' ? '#3b82f6' : '#10b981', weight: 6, opacity: 0.8 }} 
                />
              )}

              {routeResult && allCoords.length > 0 && (
                <ChangeMapBounds coords={allCoords} />
              )}
            </MapContainer>
          </div>

          {/* Floating Result Dashboard overlay */}
          {routeResult && (
            <div className="absolute top-4 right-4 bg-slate-950/90 border border-slate-800 rounded-xl p-4 z-[1000] backdrop-blur-md shadow-2xl w-64">
              <h3 className="text-xs font-bold text-slate-100 mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Sparkles size={14} className={routeResult.provider === 'google' ? 'text-blue-400' : 'text-emerald-400'} /> 
                {routeResult.provider === 'google' ? 'Google Routes Result' : 'Mapbox Directions Result'}
              </h3>
              
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 flex items-center gap-1"><Navigation size={12}/> Distance</div>
                  <div className="text-lg font-bold text-slate-200">
                    {(routeResult.distance / 1000).toFixed(2)} <span className="text-xs text-slate-400 font-normal">km</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 flex items-center gap-1"><Clock size={12}/> Traffic ETA</div>
                  <div className="text-lg font-bold text-slate-200">
                    {Math.ceil(routeResult.duration / 60)} <span className="text-xs text-slate-400 font-normal">min</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </section>

      </main>
    </div>
  );
}
