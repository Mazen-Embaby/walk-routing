"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Settings, Navigation, AlertCircle, Loader2, MapPin, Footprints, Clock, Activity } from 'lucide-react';

const startIcon = L.divIcon({
  html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #22c55e; border: 3px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const endIcon = L.divIcon({
  html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #ef4444; border: 3px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface RouteData {
  engine: string;
  distance: number;
  duration: number;
  geometry: any;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

// Map Component strictly for fitting bounds occasionally if needed.
function MapViewFitter({ route, start, end }: { route: RouteData | null, start: [number, number], end: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    // Only zoom to bounds on the very first load or if you explicitly wanted to.
    // Given markers are draggable, we won't strictly auto-fit on every drag to avoid jumping.
    const bounds = L.latLngBounds([start, end]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, []); // Run only once to center on Cairo

  return null;
}

export default function AppClient() {
  const [startPos, setStartPos] = useState<[number, number]>([30.057766, 31.345850]);
  const [endPos, setEndPos] = useState<[number, number]>([30.057821, 31.345571]);
  const [engine, setEngine] = useState<string>('osrm');
  
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [routeKey, setRouteKey] = useState<number>(Date.now());

  useEffect(() => {
    fetchRoute(startPos, endPos, engine);
  }, [engine]); // Refetch when engine changes

  const fetchRoute = async (start: [number, number], end: [number, number], selectedEngine: string) => {
    setLoading(true);
    setError(null);
    try {
      if (selectedEngine === 'osrm') {
        // Fetch directly from the OSRM public API instead of our backend
        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        const data = await res.json();
        
        if (data.code !== 'Ok') {
          throw new Error('OSRM routing failed: ' + data.message);
        }

        const route = data.routes[0];
        setRoute({
          engine: 'OSRM (Direct)',
          distance: route.distance, // in meters
          duration: route.duration, // in seconds
          geometry: route.geometry, // GeoJSON LineString
        });
        setRouteKey(Date.now()); // Update route key to force remount
      } else {
        // Fetch from the renamed backend endpoint
        const res = await fetch(`/api/walk-route?engine=${selectedEngine}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch route');
        }

        setRoute(data);
        setRouteKey(Date.now()); // Update route key to force remount
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setRoute(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDragEnd = (e: any) => {
    const marker = e.target;
    const position = marker.getLatLng();
    setStartPos([position.lat, position.lng]);
    fetchRoute([position.lat, position.lng], endPos, engine);
  };

  const handleEndDragEnd = (e: any) => {
    const marker = e.target;
    const position = marker.getLatLng();
    setEndPos([position.lat, position.lng]);
    fetchRoute(startPos, [position.lat, position.lng], engine);
  };

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] font-sans overflow-hidden flex-col md:flex-row">
      {/* Sidebar Controls */}
      <aside className="w-full md:w-80 bg-white border-b md:border-r border-slate-200 flex flex-col z-[1000] shadow-xl shrink-0 overflow-y-auto">
        
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">CairoWalker</h1>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1 block">Start Point</label>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                <input type="text" value={`${startPos[0].toFixed(6)}, ${startPos[1].toFixed(6)}`} className="bg-transparent text-sm text-slate-700 outline-none w-full" readOnly />
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1 block">Destination</label>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></div>
                <input type="text" value={`${endPos[0].toFixed(6)}, ${endPos[1].toFixed(6)}`} className="bg-transparent text-sm text-slate-700 outline-none w-full" readOnly />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 flex-1 bg-slate-50/50 flex flex-col">
          <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-3 block">Routing Engine</label>
          <div className="space-y-2 mb-6">
            {([
              { id: 'osrm', label: 'OSRM Walk Engine' },
              { id: 'mapbox', label: 'Mapbox API (Requires Key)' },
              { id: 'graphhopper', label: 'GraphHopper (Requires Key)' },
              { id: 'google', label: 'Google Maps (Requires Key)' }
            ] as { id: string, label: string, disabled?: boolean }[]).map(eng => {
              const isActive = engine === eng.id;
              return (
                <button 
                  key={eng.id}
                  disabled={eng.disabled}
                  onClick={() => setEngine(eng.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                    isActive 
                      ? 'bg-white border-2 border-blue-500 shadow-sm' 
                      : 'bg-white border border-slate-200 hover:border-slate-300'
                  } ${eng.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`text-sm text-left ${isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>{eng.label}</span>
                  <div className={`w-4 h-4 rounded-full shrink-0 ${isActive ? 'border-4 border-blue-500' : 'border border-slate-300'}`}></div>
                </button>
              )
            })}
          </div>

          <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200 mt-auto shrink-0">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-blue-100 text-xs uppercase font-bold tracking-wider mb-1">Walking Time</p>
                <h2 className="text-3xl font-bold flex items-center h-9">
                  {loading ? <Loader2 size={24} className="animate-spin" /> : route ? formatDuration(route.duration) : '--'}
                </h2>
              </div>
              <p className="text-blue-100 text-sm font-medium h-6 flex items-end">
                {loading ? '...' : route ? formatDistance(route.distance) : '--'}
              </p>
            </div>
            <div className="h-1 bg-blue-400/30 rounded-full overflow-hidden">
              <div className={`h-full bg-white transition-all duration-500 ${loading ? 'w-full animate-pulse' : 'w-2/3'}`}></div>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 text-rose-600 bg-rose-50 p-4 rounded-xl text-sm font-medium border border-rose-100 leading-snug shrink-0">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 text-center bg-white hidden md:block shrink-0">
          <p className="text-xs text-slate-400 italic font-medium">Drag markers on map to update route</p>
        </div>
      </aside>

      {/* Map Interface */}
      <main className="flex-1 relative bg-[#E2E8F0] z-0">
        <MapContainer 
          center={startPos} 
          zoom={14} 
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapViewFitter route={route} start={startPos} end={endPos} />
          
          <Marker 
            position={startPos} 
            icon={startIcon} 
            draggable={true} 
            eventHandlers={{ dragend: handleStartDragEnd }} 
          />
          <Marker 
            position={endPos} 
            icon={endIcon} 
            draggable={true} 
            eventHandlers={{ dragend: handleEndDragEnd }} 
          />

          {route && route.geometry && (
            <GeoJSON 
              key={routeKey} 
              data={route.geometry} 
              style={{
                color: '#2563EB',
                weight: 5,
                opacity: 0.8,
                dashArray: '1, 8',
                lineCap: 'round',
                lineJoin: 'round'
              }} 
            />
          )}
        </MapContainer>

        {/* Bottom Meta Overlay */}
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur rounded-full px-4 md:px-6 py-2.5 md:py-3 border border-slate-200 shadow-2xl flex items-center gap-4 md:gap-8 pointer-events-none z-[1000] whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-widest hidden sm:inline">Real-time Traffic: Low</span>
            <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-widest sm:hidden">Traffic: Low</span>
          </div>
          <div className="w-[1px] h-4 bg-slate-300"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-widest hidden sm:inline">Weather: 28°C Clear</span>
            <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-widest sm:hidden">28°C</span>
          </div>
        </div>
      </main>
    </div>
  );
}
