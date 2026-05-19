"use client";

import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, Loader2, AlertCircle, ArrowRight, Navigation } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      // Successful login - redirect to home page with full reload to refresh session cookies
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 font-sans p-4 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] rounded-3xl p-8 sm:p-10 transition-all duration-300 relative z-10">
        
        {/* Brand/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl items-center justify-center shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
            <Navigation className="w-7 h-7 text-white rotate-45" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300">
            CairoWalker
          </h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">
            Walk Routing Portal &bull; Enter credentials to enter
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-start gap-3 text-rose-300 bg-rose-950/40 border border-rose-800/40 p-4 rounded-2xl text-sm font-medium animate-fadeIn">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />
            <p>{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-400 block ml-1">
              Username
            </label>
            <div className="relative flex items-center">
              <User size={18} className="absolute left-4 text-slate-400 transition-colors pointer-events-none group-focus-within:text-blue-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={loading}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-blue-500/60 focus:bg-white/[0.08] rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder-slate-500 outline-none text-sm transition-all focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-400 block ml-1">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock size={18} className="absolute left-4 text-slate-400 transition-colors pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={loading}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-blue-500/60 focus:bg-white/[0.08] rounded-2xl pl-12 pr-12 py-3.5 text-white placeholder-slate-500 outline-none text-sm transition-all focus:ring-4 focus:ring-blue-500/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-4 text-slate-400 hover:text-slate-200 transition-colors outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 disabled:opacity-50 disabled:pointer-events-none mt-8 text-sm"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <>
                <span>Access Dashboard</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center border-t border-white/[0.06] pt-6">
          <p className="text-xs text-slate-500 font-medium">
            Protected Applet &bull; Cairo Maps &copy; 2026
          </p>
        </div>
      </div>
    </main>
  );
}
