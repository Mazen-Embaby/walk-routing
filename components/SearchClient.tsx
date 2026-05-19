"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  ChevronLeft, 
  Search, 
  MapPin, 
  Globe, 
  Map as MapIcon, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Layers,
  RefreshCw
} from 'lucide-react';

// Custom Marker styling for the geocoded location
const pinIcon = L.divIcon({
  html: `<div style="width: 24px; height: 24px; border-radius: 50%; background-color: #3b82f6; border: 3px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center;"><div style="width: 8px; height: 8px; border-radius: 50%; background-color: white;"></div></div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Helper component to center Leaflet map on coordinates change
function ChangeMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

export default function SearchClient() {
  const [query, setQuery] = useState<string>('');
  const [provider, setProvider] = useState<string>('mapbox');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([30.0444, 31.2357]); // Cairo center default

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedResult(null);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&provider=${provider}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search locations');
      }

      setResults(data.results || []);
      
      // Auto-select the first result if available
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        setSelectedResult(first);
        setMapCenter([first.lat, first.lng]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during searching.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const selectResult = (result: any) => {
    setSelectedResult(result);
    setMapCenter([result.lat, result.lng]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Mesh Gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/15 rounded-full blur-[120px] pointer-events-none"></div>

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
            <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 tracking-tight flex items-center gap-2">
              <Sparkles size={18} className="text-blue-400" /> Unified Geocoding Search Engine
            </h1>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
            Protected Route
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Column - Search & Controls (5 Columns) */}
        <section className="lg:col-span-5 bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col justify-between h-[calc(100vh-180px)] min-h-[500px]">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Heading and Providers selector */}
            <div className="mb-6">
              <h2 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
                <Layers size={16} className="text-blue-400" /> Select Search API Provider
              </h2>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800/60">
                <button
                  onClick={() => setProvider('mapbox')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    provider === 'mapbox' 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Mapbox Geocoding
                </button>
                <button
                  onClick={() => setProvider('google')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    provider === 'google' 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Google Places API
                </button>
              </div>
            </div>

            {/* Search query input */}
            <form onSubmit={handleSearch} className="mb-6">
              <div className="flex gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 items-center focus-within:border-blue-500 transition-colors">
                <Search size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search places via ${provider === 'mapbox' ? 'Mapbox' : 'Google'}...`}
                  className="bg-transparent text-sm text-slate-100 outline-none w-full placeholder-slate-600"
                />
                <button 
                  type="submit"
                  disabled={!query.trim() || loading}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-slate-400 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {loading ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    "Search"
                  )}
                </button>
              </div>
            </form>

            {/* Display error if present */}
            {error && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-lg flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <span className="font-bold">Geocoding Failure:</span> {error}
                  <div className="text-[10px] text-rose-400/80 mt-1">Please ensure the respective API key is added in your .env file.</div>
                </div>
              </div>
            )}

            {/* Display list of search results */}
            <div className="flex-1 overflow-y-auto pr-1">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2.5 block">Search Results</label>
              
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                  <Loader2 className="animate-spin text-blue-500" size={24} />
                  <span className="text-xs">Querying {provider === 'mapbox' ? 'Mapbox Places...' : 'Google Maps Geocoding...'}</span>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800/80 bg-slate-950/20 rounded-xl px-4">
                  <Globe className="mx-auto text-slate-600 mb-2" size={24} />
                  <p className="text-xs font-semibold text-slate-400">No Locations Loaded</p>
                  <p className="text-[10px] text-slate-500 mt-1">Type in the search field above to load geocoding coordinates.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectResult(result)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedResult === result
                          ? 'bg-blue-600/15 border-blue-500/80 shadow-md shadow-blue-500/5'
                          : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-2">
                          <MapPin size={16} className={`shrink-0 mt-0.5 ${selectedResult === result ? 'text-blue-400' : 'text-slate-500'}`} />
                          <div>
                            <p className="text-xs font-semibold text-slate-100 leading-tight">{result.name}</p>
                            <p className="text-[10px] font-mono text-slate-500 mt-1">Lat: {result.lat.toFixed(6)}, Lng: {result.lng.toFixed(6)}</p>
                          </div>
                        </div>
                        <span className={`text-[8px] uppercase tracking-wider font-bold py-0.5 px-1.5 rounded border ${
                          result.provider === 'google' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {result.provider}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column - Map Preview (7 Columns) */}
        <section className="lg:col-span-7 bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden h-[calc(100vh-180px)] min-h-[500px]">
          <div className="mb-4 border-b border-slate-800/60 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <MapIcon size={18} />
              </div>
              <div>
                <h2 className="text-md font-bold text-slate-100">Live Spatial Coordinates Map</h2>
                <p className="text-[11px] text-slate-400">Verifying geocoding results inside an interactive viewport</p>
              </div>
            </div>
          </div>

          {/* Map canvas */}
          <div className="flex-1 w-full bg-slate-950 rounded-xl overflow-hidden relative border border-slate-800 z-10">
            <MapContainer 
              center={mapCenter} 
              zoom={13} 
              style={{ height: '100%', width: '100%', background: '#0b0f19' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {selectedResult && (
                <>
                  <Marker position={[selectedResult.lat, selectedResult.lng]} icon={pinIcon} />
                  <ChangeMapCenter center={[selectedResult.lat, selectedResult.lng]} />
                </>
              )}
            </MapContainer>

            {/* Interactive coordinate detail overlay card */}
            {selectedResult && (
              <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 z-[1000] backdrop-blur-md flex justify-between items-center shadow-2xl">
                <div>
                  <span className="text-[8px] uppercase tracking-wider font-bold text-blue-400 block">Selected Target</span>
                  <span className="text-xs font-semibold text-slate-200 block truncate max-w-[320px] mt-0.5">{selectedResult.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono text-slate-400 block">LAT: {selectedResult.lat.toFixed(6)}</span>
                  <span className="text-[9px] font-mono text-slate-400 block">LNG: {selectedResult.lng.toFixed(6)}</span>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Footer details */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-[10px] text-slate-500 relative z-10">
        CairoWalker Geocoding Engine Module • Dual Provider Gateway • Secured via Session Cookies
      </footer>
    </div>
  );
}
