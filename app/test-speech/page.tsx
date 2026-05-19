"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  Volume2, 
  Mic, 
  Square, 
  Play, 
  Sparkles, 
  UploadCloud, 
  Activity, 
  AlertCircle, 
  Trash2, 
  Settings,
  RefreshCw
} from 'lucide-react';

export default function TestSpeechPage() {
  // Global / TTS States
  const [ttsText, setTtsText] = useState<string>("Welcome to CairoWalker navigation network. Your walk route is Snapped to the Nile boardwalk, offering a scenic path through downtown Cairo.");
  const [ttsVoice, setTtsVoice] = useState<string>("Aoede");
  const [ttsModel, setTtsModel] = useState<string>("gemini-2.0-flash");
  const [ttsTemp, setTtsTemp] = useState<number>(0.7);
  const [ttsSystemInstruction, setTtsSystemInstruction] = useState<string>("Read the text with natural cadence, appropriate pauses, and clear pronunciation.");
  const [ttsLoading, setTtsLoading] = useState<boolean>(false);
  const [ttsPlaying, setTtsPlaying] = useState<boolean>(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  
  // STT States
  const [sttModel, setSttModel] = useState<string>("gemini-2.5-flash");
  const [sttPrompt, setSttPrompt] = useState<string>("Transcribe the audio exactly. Do not add explanations.");
  const [sttTemp, setSttTemp] = useState<number>(0.2);
  const [sttSystemInstruction, setSttSystemInstruction] = useState<string>("");
  const [recording, setRecording] = useState<boolean>(false);
  const [recordTime, setRecordTime] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [sttLoading, setSttLoading] = useState<boolean>(false);
  const [sttResult, setSttResult] = useState<string>("");
  const [sttError, setSttError] = useState<string | null>(null);

  // Audio Context & Playback Refs for TTS
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);

  // MediaRecorder Refs for STT
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTtsPlayback();
      stopRecording();
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  // Handle Record Timer
  useEffect(() => {
    if (recording) {
      recordTimerRef.current = setInterval(() => {
        setRecordTime(t => t + 1);
      }, 1000);
    } else {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      setRecordTime(0);
    }
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [recording]);

  // Format Record Time
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- TTS: PLAYBACK LOGIC (PCM 24kHz Mono 16-bit LE) ---
  const stopTtsPlayback = () => {
    // Abort active fetch if any
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    // Stop all scheduled Web Audio nodes
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current = [];

    // Close Audio Context
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch(e) {}
      audioCtxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
    setTtsPlaying(false);
  };

  const handleSpeak = async () => {
    stopTtsPlayback();
    setTtsLoading(true);
    setTtsError(null);
    setTtsPlaying(true);

    try {
      // 1. Initialize AudioContext at 24kHz sample rate (Gemini default output rate)
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      // 2. Setup abort controller
      const abortController = new AbortController();
      ttsAbortControllerRef.current = abortController;

      // 3. Request TTS endpoint
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText,
          voice: ttsVoice,
          model: ttsModel,
          temperature: ttsTemp,
          systemInstruction: ttsSystemInstruction
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to start TTS stream');
      }

      setTtsLoading(false);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream reader is not available');

      const decoder = new TextDecoder();
      let bufferString = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bufferString += decoder.decode(value, { stream: true });
        
        // Parse Server-Sent Events (SSE) from the stream buffer
        const lines = bufferString.split('\n');
        bufferString = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event: audio')) {
            // Next line contains data
            continue;
          }

          if (trimmed.startsWith('data:')) {
            try {
              const payload = JSON.parse(trimmed.slice(5).trim());
              if (payload.audio) {
                // Decode base64 PCM to binary
                const base64Str = payload.audio;
                const binaryStr = window.atob(base64Str);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }

                // Convert signed 16-bit PCM little-endian values to Float32 [-1.0, 1.0]
                const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
                const float32Array = new Float32Array(int16Array.length);
                for (let i = 0; i < int16Array.length; i++) {
                  float32Array[i] = int16Array[i] / 32768.0;
                }

                if (float32Array.length === 0) continue;

                // Create AudioBuffer (Mono, 24000Hz)
                const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
                audioBuffer.copyToChannel(float32Array, 0);

                // Queue playback source
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);

                const startTime = Math.max(nextPlayTimeRef.current, audioCtx.currentTime);
                source.start(startTime);
                
                // Track scheduled end time
                nextPlayTimeRef.current = startTime + audioBuffer.duration;
                activeSourcesRef.current.push(source);

                // Auto stop state when last chunk finishes
                source.onended = () => {
                  // Clean finished nodes from active sources
                  activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                  if (activeSourcesRef.current.length === 0 && !ttsLoading) {
                    setTtsPlaying(false);
                  }
                };
              } else if (payload.error) {
                throw new Error(payload.error);
              }
            } catch (err: any) {
              console.error('Error parsing audio chunk:', err);
            }
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setTtsError(err.message || 'Error occurred during streaming.');
      stopTtsPlayback();
    } finally {
      setTtsLoading(false);
    }
  };

  // --- STT: RECORDING & TRANSCRIPTION LOGIC ---
  const startRecording = async () => {
    setSttError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordedBlob(audioBlob);
        setRecordedUrl(URL.createObjectURL(audioBlob));
        
        // Stop all track devices to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      console.error(err);
      setSttError('Microphone access denied or error starting recording.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const discardRecording = () => {
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    setSttResult("");
  };

  const handleTranscribe = async () => {
    if (!recordedBlob) return;
    setSttLoading(true);
    setSttResult("");
    setSttError(null);

    try {
      const formData = new FormData();
      formData.append('file', recordedBlob, 'recording.wav');
      formData.append('model', sttModel);
      formData.append('prompt', sttPrompt);
      formData.append('temperature', sttTemp.toString());
      if (sttSystemInstruction) {
        formData.append('systemInstruction', sttSystemInstruction);
      }

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to start STT stream');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream reader is not available');

      const decoder = new TextDecoder();
      let bufferString = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bufferString += decoder.decode(value, { stream: true });
        
        const lines = bufferString.split('\n');
        bufferString = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('data:')) {
            try {
              const payload = JSON.parse(trimmed.slice(5).trim());
              if (payload.text) {
                setSttResult(prev => prev + payload.text);
              } else if (payload.error) {
                throw new Error(payload.error);
              }
            } catch (e) {
              // Ignore partial or parse errors
            }
          }
        }
      }

    } catch (err: any) {
      console.error(err);
      setSttError(err.message || 'Error occurred during transcription.');
    } finally {
      setSttLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Decorative Mesh Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/15 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Premium Navigation Header */}
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
              <Sparkles size={18} className="text-blue-400 animate-pulse" /> Gemini Multimodal Audio Portal
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
            Protected Session
          </div>
        </div>
      </header>

      {/* Dashboard Body Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
        
        {/* ============================================================== */}
        {/* 1. TEXT-TO-SPEECH (TTS) INTERFACE PANEL */}
        {/* ============================================================== */}
        <section className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Volume2 size={18} />
                </div>
                <div>
                  <h2 className="text-md font-bold text-slate-100">Text-to-Speech Streaming</h2>
                  <p className="text-[11px] text-slate-400">Verbatim voice delivery using native Gemini Audio</p>
                </div>
              </div>
              <Settings size={16} className="text-slate-500 hover:text-slate-300 transition-colors" />
            </div>

            {/* Error Message banner */}
            {ttsError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-lg flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <span className="font-bold">Error:</span> {ttsError}
                </div>
              </div>
            )}

            {/* Config parameters accordion / box */}
            <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-4 mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Model Name</label>
                  <select 
                    value={ttsModel} 
                    onChange={(e) => setTtsModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="gemini-2.0-flash">gemini-2.0-flash (Recommended)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Voice Name</label>
                  <select 
                    value={ttsVoice} 
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="Aoede">Aoede (Clear & Lyric)</option>
                    <option value="Kore">Kore (Warm & Grounded)</option>
                    <option value="Puck">Puck (Cheerful & Energetic)</option>
                    <option value="Charon">Charon (Deep & Professional)</option>
                    <option value="Fenrir">Fenrir (Resonant & Calm)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">Temperature: {ttsTemp.toFixed(1)}</label>
                  <span className="text-[9px] text-slate-500">Lower = more consistent cadence</span>
                </div>
                <input 
                  type="range" 
                  min="0.0" 
                  max="2.0" 
                  step="0.1" 
                  value={ttsTemp} 
                  onChange={(e) => setTtsTemp(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Voice Tone/Instruction Guide</label>
                <input 
                  type="text" 
                  value={ttsSystemInstruction}
                  onChange={(e) => setTtsSystemInstruction(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-blue-500"
                  placeholder="e.g. Read slowly, like a news anchor."
                />
              </div>
            </div>

            {/* Input Textarea */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">Text to Read</label>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                className="w-full min-h-[120px] bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 text-slate-200 text-sm outline-none focus:border-blue-500 placeholder-slate-600 transition-colors leading-relaxed"
                placeholder="Type anything for Gemini to read aloud..."
              />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/40">
            {/* Visualizer when playing */}
            {ttsPlaying && (
              <div className="flex items-center gap-3 bg-blue-950/20 border border-blue-500/10 rounded-xl px-4 py-3 mb-4 transition-all">
                <div className="flex gap-[3px] items-end h-4 w-6 shrink-0">
                  <span className="w-[3px] bg-blue-400 animate-[bounce_0.8s_infinite] h-2"></span>
                  <span className="w-[3px] bg-blue-400 animate-[bounce_0.5s_infinite] h-4"></span>
                  <span className="w-[3px] bg-blue-400 animate-[bounce_0.6s_infinite] h-1.5"></span>
                  <span className="w-[3px] bg-blue-400 animate-[bounce_0.7s_infinite] h-3"></span>
                </div>
                <div className="text-xs text-slate-300 truncate">
                  {ttsLoading ? "Buffering raw stream..." : "Streaming audio from Gemini..."}
                </div>
              </div>
            )}

            {/* Speaker Button controls */}
            <div className="flex items-center gap-3">
              {ttsPlaying ? (
                <button
                  onClick={stopTtsPlayback}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-rose-600/10 flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <Square size={16} fill="white" /> Stop Playback
                </button>
              ) : (
                <button
                  onClick={handleSpeak}
                  disabled={!ttsText.trim() || ttsLoading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  {ttsLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Synthesizing...
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="white" /> Generate & Speak
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 2. SPEECH-TO-TEXT (STT) INTERFACE PANEL */}
        {/* ============================================================== */}
        <section className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Mic size={18} />
                </div>
                <div>
                  <h2 className="text-md font-bold text-slate-100">Speech-to-Text Transcription</h2>
                  <p className="text-[11px] text-slate-400">Audio voice extraction using native Gemini LLM</p>
                </div>
              </div>
              <Activity size={16} className="text-slate-500 hover:text-slate-300 transition-colors" />
            </div>

            {/* Error Message banner */}
            {sttError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-lg flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <span className="font-bold">Error:</span> {sttError}
                </div>
              </div>
            )}

            {/* Config settings */}
            <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-4 mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Model Name</label>
                  <select 
                    value={sttModel} 
                    onChange={(e) => setSttModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">Temperature: {sttTemp.toFixed(1)}</label>
                  </div>
                  <input 
                    type="range" 
                    min="0.0" 
                    max="2.0" 
                    step="0.1" 
                    value={sttTemp} 
                    onChange={(e) => setSttTemp(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Instruction Prompt / Guide</label>
                <input 
                  type="text" 
                  value={sttPrompt}
                  onChange={(e) => setSttPrompt(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                  placeholder="e.g. Transcribe the audio exactly in Arabic."
                />
              </div>
            </div>

            {/* Microphone recorder unit */}
            <div className="border border-slate-800/80 bg-slate-950/60 rounded-xl p-6 flex flex-col items-center justify-center mb-4 transition-all">
              {recording ? (
                <div className="flex flex-col items-center space-y-4">
                  {/* Pulsing red mic ring */}
                  <div className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-14 w-14 rounded-full bg-rose-500/20 animate-ping"></span>
                    <button 
                      onClick={stopRecording}
                      className="relative h-12 w-12 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center cursor-pointer transition-colors shadow-lg shadow-rose-600/10"
                    >
                      <Square size={16} fill="white" />
                    </button>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-rose-400 flex items-center gap-1.5 justify-center">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> Recording Active
                    </div>
                    <div className="text-2xl font-mono font-semibold text-slate-200 mt-1">
                      {formatTime(recordTime)}
                    </div>
                  </div>
                </div>
              ) : recordedUrl ? (
                <div className="w-full flex flex-col items-center space-y-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Volume2 size={16} />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-emerald-400">Audio Captured</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Size: {(recordedBlob!.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <div className="w-full flex items-center gap-2 max-w-[280px]">
                    <audio src={recordedUrl} controls className="w-full text-xs" />
                    <button 
                      onClick={discardRecording}
                      className="p-2 text-slate-500 hover:text-rose-400 transition-colors bg-slate-900 border border-slate-800 rounded-lg cursor-pointer"
                      title="Discard Recording"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <button 
                    onClick={startRecording}
                    className="h-12 w-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer transition-transform hover:scale-105 shadow-lg shadow-indigo-600/10"
                  >
                    <Mic size={18} />
                  </button>
                  <div className="text-center">
                    <div className="text-xs font-bold text-slate-300">Start Recording</div>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">Click the mic to record a snippet from your local browser</p>
                  </div>
                </div>
              )}
            </div>

            {/* Results Block */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">Streaming Transcription Result</label>
              <div className="w-full min-h-[100px] bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 text-slate-200 text-sm overflow-y-auto leading-relaxed relative">
                {sttLoading && !sttResult && (
                  <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
                    <div className="flex items-center gap-2 text-xs text-indigo-400">
                      <RefreshCw size={14} className="animate-spin" /> Uploading & transcribing stream...
                    </div>
                  </div>
                )}
                {sttResult ? (
                  <p className="whitespace-pre-wrap">{sttResult}</p>
                ) : (
                  <span className="text-slate-600 italic text-xs">Record audio and hit "Transcribe Audio" to view result...</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/40">
            <button
              onClick={handleTranscribe}
              disabled={!recordedBlob || sttLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/15 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              {sttLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Transcribing Stream...
                </>
              ) : (
                <>
                  <UploadCloud size={16} /> Transcribe Audio
                </>
              )}
            </button>
          </div>
        </section>

      </main>

      {/* Footer details */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-[10px] text-slate-500 relative z-10">
        CairoWalker Audio Core Module • Secured via Middleware Session Cookie • Powered by Gemini Flash 2.5
      </footer>
    </div>
  );
}
